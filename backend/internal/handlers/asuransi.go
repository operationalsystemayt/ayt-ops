package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"ayt-ops/backend/internal/models"
	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// ── LIST ──────────────────────────────────────────────────────────────────────

func (h *Handler) ListAsuransi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			ta.id::text, ta.trip_id::text,
			ta.nama_polis, ta.kode_booking, ta.nama_pemegang,
			ta.periode_mulai::text, ta.periode_selesai::text,
			ta.file_name, ta.drive_file_id, ta.drive_view_url, ta.mime_type,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(ta.peserta_ids)),
				''
			) AS peserta_names,
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(ta.peserta_ids) p),
				'{}'::text[]
			) AS peserta_ids,
			ta.created_at, ta.updated_at
		FROM trip_asuransi ta
		WHERE ta.trip_id = $1::uuid
		ORDER BY ta.created_at ASC`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.TripAsuransi{}
	for rows.Next() {
		var item models.TripAsuransi
		var pesertaNamesStr string
		var pesertaIDsStr []string
		if err := rows.Scan(
			&item.ID, &item.TripID,
			&item.NamaPolis, &item.KodeBooking, &item.NamaPemegang,
			&item.PeriodeMulai, &item.PeriodeSelesai,
			&item.FileName, &item.DriveFileId, &item.DriveViewUrl, &item.MimeType,
			&pesertaNamesStr,
			&pesertaIDsStr,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			jsonErr(w, 500, err.Error())
			return
		}
		item.PesertaIds = pesertaIDsStr
		if pesertaNamesStr != "" {
			item.PesertaNames = strings.Split(pesertaNamesStr, ", ")
		} else {
			item.PesertaNames = []string{}
		}
		list = append(list, item)
	}
	jsonOK(w, list)
}

// ── CREATE ────────────────────────────────────────────────────────────────────

func (h *Handler) CreateAsuransi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		// Try as regular form
		if err2 := r.ParseForm(); err2 != nil {
			jsonErr(w, 400, "failed to parse form")
			return
		}
	}

	namaPolis := r.FormValue("nama_polis")
	kodeBooking := r.FormValue("kode_booking")
	namaPemegang := r.FormValue("nama_pemegang")
	periodeMulai := r.FormValue("periode_mulai")
	periodeSelesai := r.FormValue("periode_selesai")
	pesertaIdsStr := r.FormValue("peserta_ids")

	var pesertaIds []string
	if pesertaIdsStr != "" {
		if err := json.Unmarshal([]byte(pesertaIdsStr), &pesertaIds); err != nil {
			pesertaIds = []string{}
		}
	}

	// Get trip info for Drive upload
	var namaTrip string
	var driveFolderID *string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	// Optional file upload
	var fileName, driveFileID, driveViewURL, mimeType *string
	file, header, fileErr := r.FormFile("file")
	if fileErr == nil {
		defer file.Close()

		drv, err := services.NewDriveService(ctx)
		if err != nil {
			jsonErr(w, 503, err.Error())
			return
		}

		folderID, err := h.ensureTripFolder(ctx, drv, tripID)
		if err != nil {
			jsonErr(w, 500, "create trip folder: "+err.Error())
			return
		}
		driveFolderID = &folderID

		subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "8. Data Asuransi")
		if err != nil {
			jsonErr(w, 500, err.Error())
			return
		}

		fn := header.Filename
		if fn == "" {
			fn = "asuransi"
		}
		mt := header.Header.Get("Content-Type")
		if mt == "" || mt == "application/octet-stream" {
			mt = detectMime(mt, header.Filename)
		}

		fid, vurl, err := drv.UploadFile(ctx, subFolder, fn, mt, file)
		if err != nil {
			log.Printf("[ASURANSI] upload error: %v", err)
			jsonErr(w, 500, "drive upload failed: "+err.Error())
			return
		}

		fileName = &fn
		driveFileID = &fid
		driveViewURL = &vurl
		mimeType = &mt
	}

	pesertaArrLiteral := formatUUIDArray(pesertaIds)

	var item models.TripAsuransi
	var pesertaNamesStr string
	var pesertaIDsOut []string

	err = h.DB.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO trip_asuransi
		  (trip_id, nama_polis, kode_booking, nama_pemegang,
		   periode_mulai, periode_selesai,
		   file_name, drive_file_id, drive_view_url, mime_type, peserta_ids)
		VALUES
		  ($1::uuid, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, %s)
		RETURNING
			id::text, trip_id::text,
			nama_polis, kode_booking, nama_pemegang,
			periode_mulai::text, periode_selesai::text,
			file_name, drive_file_id, drive_view_url, mime_type,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp WHERE mp.id = ANY(peserta_ids)),
				''
			),
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(peserta_ids) p),
				'{}'::text[]
			),
			created_at, updated_at`,
		pesertaArrLiteral),
		tripID,
		nullIfEmpty(namaPolis), nullIfEmpty(kodeBooking), nullIfEmpty(namaPemegang),
		nullIfEmpty(periodeMulai), nullIfEmpty(periodeSelesai),
		fileName, driveFileID, driveViewURL, mimeType,
	).Scan(
		&item.ID, &item.TripID,
		&item.NamaPolis, &item.KodeBooking, &item.NamaPemegang,
		&item.PeriodeMulai, &item.PeriodeSelesai,
		&item.FileName, &item.DriveFileId, &item.DriveViewUrl, &item.MimeType,
		&pesertaNamesStr,
		&pesertaIDsOut,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, "db insert: "+err.Error())
		return
	}

	item.PesertaIds = pesertaIDsOut
	if pesertaNamesStr != "" {
		item.PesertaNames = strings.Split(pesertaNamesStr, ", ")
	} else {
		item.PesertaNames = []string{}
	}

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── REPLACE FILE ─────────────────────────────────────────────────────────────

func (h *Handler) ReplaceAsuransiFile(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	aid := chi.URLParam(r, "aid")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "field 'file' required")
		return
	}
	defer file.Close()

	var oldDriveFileID *string
	err = h.DB.QueryRow(ctx,
		`SELECT drive_file_id FROM trip_asuransi WHERE id = $1::uuid AND trip_id = $2::uuid`,
		aid, tripID,
	).Scan(&oldDriveFileID)
	if err != nil {
		jsonErr(w, 404, "asuransi record not found")
		return
	}

	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx,
		`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "8. Data Asuransi")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	fn := header.Filename
	if fn == "" {
		fn = "asuransi"
	}
	mt := header.Header.Get("Content-Type")
	if mt == "" || mt == "application/octet-stream" {
		mt = detectMime(mt, header.Filename)
	}

	fid, vurl, err := drv.UploadFile(ctx, subFolder, fn, mt, file)
	if err != nil {
		log.Printf("[ASURANSI] replace upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	// Delete old Drive file (best-effort)
	if oldDriveFileID != nil && *oldDriveFileID != "" {
		if delErr := drv.DeleteFile(ctx, *oldDriveFileID); delErr != nil {
			log.Printf("[ASURANSI] delete old file %s: %v (best effort)", *oldDriveFileID, delErr)
		}
	}

	_, err = h.DB.Exec(ctx, `
		UPDATE trip_asuransi
		SET file_name = $1, drive_file_id = $2, drive_view_url = $3, mime_type = $4, updated_at = NOW()
		WHERE id = $5::uuid AND trip_id = $6::uuid`,
		fn, fid, vurl, mt, aid, tripID,
	)
	if err != nil {
		jsonErr(w, 500, "db update: "+err.Error())
		return
	}

	jsonOK(w, map[string]string{
		"file_name":      fn,
		"drive_file_id":  fid,
		"drive_view_url": vurl,
		"mime_type":      mt,
	})
}

// ── UPDATE (form data only) ───────────────────────────────────────────────────

func (h *Handler) UpdateAsuransi(w http.ResponseWriter, r *http.Request) {
	aid := chi.URLParam(r, "aid")
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	var body struct {
		NamaPolis      *string  `json:"nama_polis"`
		KodeBooking    *string  `json:"kode_booking"`
		NamaPemegang   *string  `json:"nama_pemegang"`
		PeriodeMulai   *string  `json:"periode_mulai"`
		PeriodeSelesai *string  `json:"periode_selesai"`
		PesertaIds     []string `json:"peserta_ids"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	_, err := h.DB.Exec(ctx, fmt.Sprintf(`
		UPDATE trip_asuransi SET
			nama_polis      = COALESCE($2, nama_polis),
			kode_booking    = COALESCE($3, kode_booking),
			nama_pemegang   = COALESCE($4, nama_pemegang),
			periode_mulai   = COALESCE($5::date, periode_mulai),
			periode_selesai = COALESCE($6::date, periode_selesai),
			peserta_ids     = %s,
			updated_at      = $7
		WHERE id = $1::uuid AND trip_id = $8::uuid`,
		pesertaArrLiteral),
		aid,
		body.NamaPolis, body.KodeBooking, body.NamaPemegang,
		nilIfEmpty(body.PeriodeMulai), nilIfEmpty(body.PeriodeSelesai),
		time.Now(), tripID,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteAsuransi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	aid := chi.URLParam(r, "aid")
	ctx := r.Context()

	var driveFileID *string
	err := h.DB.QueryRow(ctx,
		`SELECT drive_file_id FROM trip_asuransi WHERE id = $1::uuid AND trip_id = $2::uuid`,
		aid, tripID,
	).Scan(&driveFileID)
	if err != nil {
		jsonErr(w, 404, "asuransi record not found")
		return
	}

	_, err = h.DB.Exec(ctx,
		`DELETE FROM trip_asuransi WHERE id = $1::uuid AND trip_id = $2::uuid`,
		aid, tripID,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Delete Drive file (best-effort, only if drive configured)
	if driveFileID != nil && *driveFileID != "" {
		drv, drvErr := services.NewDriveService(ctx)
		if drvErr == nil {
			if delErr := drv.DeleteFile(ctx, *driveFileID); delErr != nil {
				log.Printf("[ASURANSI] delete drive file %s: %v (best effort)", *driveFileID, delErr)
			}
		}
	}

	w.WriteHeader(204)
}

// ── helper ───────────────────────────────────────────────────────────────────

type asuransiItem struct {
	fileName    string
	driveFileID string
}

func (h *Handler) getAsuransiItems(r *http.Request, tripID string) ([]asuransiItem, string, error) {
	ctx := r.Context()

	var namaTrip string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip)
	if err != nil {
		return nil, "", fmt.Errorf("trip not found")
	}

	rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(file_name,''), COALESCE(drive_file_id,'')
		FROM trip_asuransi
		WHERE trip_id = $1::uuid AND drive_file_id IS NOT NULL AND drive_file_id != ''
		ORDER BY created_at ASC`, tripID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var items []asuransiItem
	for rows.Next() {
		var item asuransiItem
		if err := rows.Scan(&item.fileName, &item.driveFileID); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, namaTrip, nil
}

func buildAsuransiZipBuffer(drv *services.DriveService, r *http.Request, items []asuransiItem) (bytes.Buffer, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, item := range items {
		data, _, err := drv.DownloadFile(r.Context(), item.driveFileID)
		if err != nil {
			log.Printf("[ASURANSI-ZIP] skip file %s (%s): %v", item.fileName, item.driveFileID, err)
			continue
		}
		f, err := zw.Create(item.fileName)
		if err != nil {
			log.Printf("[ASURANSI-ZIP] zip create entry %s: %v", item.fileName, err)
			continue
		}
		if _, err := f.Write(data); err != nil {
			log.Printf("[ASURANSI-ZIP] zip write entry %s: %v", item.fileName, err)
		}
	}

	if err := zw.Close(); err != nil {
		return buf, err
	}
	return buf, nil
}

// ── EXPORT ZIP ────────────────────────────────────────────────────────────────

func (h *Handler) ExportZipAsuransi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	items, namaTrip, err := h.getAsuransiItems(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	buf, err := buildAsuransiZipBuffer(drv, r, items)
	if err != nil {
		jsonErr(w, 500, "zip error: "+err.Error())
		return
	}

	zipName := fmt.Sprintf("asuransi_%s.zip", slugifyName(namaTrip))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, zipName))
	w.Write(buf.Bytes())
}

// ── UPLOAD ZIP TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadZipAsuransi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	items, namaTrip, err := h.getAsuransiItems(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	buf, err := buildAsuransiZipBuffer(drv, r, items)
	if err != nil {
		jsonErr(w, 500, "zip error: "+err.Error())
		return
	}

	var driveFolderID *string
	h.DB.QueryRow(ctx, `SELECT drive_folder_id FROM trips WHERE id = $1::uuid`, tripID).
		Scan(&driveFolderID)

	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "8. Data Asuransi")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	zipName := fmt.Sprintf("asuransi_%s_%s.zip", slugifyName(namaTrip), time.Now().Format("02Jan2006"))
	_, viewURL, err := drv.UploadFile(ctx, subFolder, zipName, "application/zip", bytes.NewReader(buf.Bytes()))
	if err != nil {
		log.Printf("[ASURANSI-ZIP] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[ASURANSI-ZIP] uploaded: %s → %s", zipName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      zipName,
		"drive_view_url": viewURL,
	})
}

// nullIfEmpty converts an empty string to nil *string.
func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
