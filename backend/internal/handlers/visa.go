package handlers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// ── UPLOAD VISA ───────────────────────────────────────────────────────────────

func (h *Handler) UploadVisa(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	pid := chi.URLParam(r, "pid")
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

	// Get trip info and existing visa_drive_file_id
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

	// Get peserta name and existing visa file ID
	var namaPeserta string
	var oldVisaFileID *string
	err = h.DB.QueryRow(ctx,
		`SELECT nama_lengkap, visa_drive_file_id FROM manifest_peserta WHERE id = $1::uuid`,
		pid,
	).Scan(&namaPeserta, &oldVisaFileID)
	if err != nil {
		jsonErr(w, 404, "peserta not found")
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	// Ensure trip folder
	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "2. Data Visa")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Delete old visa file if exists
	if oldVisaFileID != nil && *oldVisaFileID != "" {
		if delErr := drv.DeleteFile(ctx, *oldVisaFileID); delErr != nil {
			log.Printf("[VISA] delete old file %s: %v (best effort)", *oldVisaFileID, delErr)
		}
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".pdf"
	}
	fileName := namaPeserta + ext
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = detectMime(mimeType, header.Filename)
	}

	fileID, viewURL, err := drv.UploadFile(ctx, subFolder, fileName, mimeType, file)
	if err != nil {
		log.Printf("[VISA] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[VISA] uploaded: fileID=%s url=%s", fileID, viewURL)

	_, dbErr := h.DB.Exec(ctx,
		`UPDATE manifest_peserta SET visa_drive_file_id = $1, visa_status = 'uploaded', updated_at = NOW() WHERE id = $2::uuid`,
		fileID, pid,
	)
	if dbErr != nil {
		jsonErr(w, 500, "db update: "+dbErr.Error())
		return
	}

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── DELETE VISA ───────────────────────────────────────────────────────────────

func (h *Handler) DeleteVisa(w http.ResponseWriter, r *http.Request) {
	pid := chi.URLParam(r, "pid")
	ctx := r.Context()

	var oldVisaFileID *string
	err := h.DB.QueryRow(ctx,
		`SELECT visa_drive_file_id FROM manifest_peserta WHERE id = $1::uuid`,
		pid,
	).Scan(&oldVisaFileID)
	if err != nil {
		jsonErr(w, 404, "peserta not found")
		return
	}

	if oldVisaFileID != nil && *oldVisaFileID != "" {
		drv, drvErr := services.NewDriveService(ctx)
		if drvErr == nil {
			if delErr := drv.DeleteFile(ctx, *oldVisaFileID); delErr != nil {
				log.Printf("[VISA] delete file %s: %v (best effort)", *oldVisaFileID, delErr)
			}
		}
	}

	_, err = h.DB.Exec(ctx,
		`UPDATE manifest_peserta SET visa_drive_file_id = NULL, visa_status = 'pending', updated_at = NOW() WHERE id = $1::uuid`,
		pid,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	w.WriteHeader(204)
}

// ── CSV builder ───────────────────────────────────────────────────────────────

type visaCSVRow struct {
	No          int
	Title       string
	NamaLengkap string
	NoPaspor    string
	VisaStatus  string
}

func visaStatusLabel(s string) string {
	switch s {
	case "uploaded":
		return "SUDAH UPLOAD"
	case "pending":
		return "BELUM UPLOAD"
	case "not_required":
		return "TIDAK PERLU"
	case "approved":
		return "APPROVED"
	case "rejected":
		return "REJECTED"
	default:
		return strings.ToUpper(s)
	}
}

func (h *Handler) buildVisaCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
	ctx := r.Context()

	var namaTrip, tglBerangkat, tglPulang string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, tgl_berangkat::text, tgl_pulang::text FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &tglBerangkat, &tglPulang)
	if err != nil {
		return nil, "", "", fmt.Errorf("trip not found: %w", err)
	}

	rows, err := h.DB.Query(ctx, `
		SELECT
			no_urut,
			COALESCE(title::text, ''),
			nama_lengkap,
			COALESCE(no_paspor, ''),
			visa_status::text
		FROM manifest_peserta
		WHERE trip_id = $1::uuid
		ORDER BY no_urut`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	var dataRows []visaCSVRow
	for rows.Next() {
		var dr visaCSVRow
		if err := rows.Scan(&dr.No, &dr.Title, &dr.NamaLengkap, &dr.NoPaspor, &dr.VisaStatus); err != nil {
			continue
		}
		dataRows = append(dataRows, dr)
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	numCols := 6
	emptyRow := make([]string, numCols)

	// Header block
	hdrRow := make([]string, numCols)
	hdrRow[0] = "DATA VISA " + strings.ToUpper(namaTrip)
	cw.Write(hdrRow)

	dateRow := make([]string, numCols)
	dateRow[0] = tripDateRange(tglBerangkat, tglPulang)
	cw.Write(dateRow)

	cw.Write(emptyRow)

	// Column headers
	cw.Write([]string{"NO", "TITLE", "NAMA LENGKAP", "NO PASPOR", "STATUS VISA", "KET"})

	// Data rows
	for _, dr := range dataRows {
		cw.Write([]string{
			fmt.Sprintf("%d", dr.No),
			dr.Title,
			dr.NamaLengkap,
			dr.NoPaspor,
			visaStatusLabel(dr.VisaStatus),
			"",
		})
	}

	cw.Flush()

	fileName := fmt.Sprintf("manifest_visa_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportVisaCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildVisaCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadVisaCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildVisaCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	var driveFolderID *string
	h.DB.QueryRow(ctx, `SELECT drive_folder_id FROM trips WHERE id = $1::uuid`, tripID).
		Scan(&driveFolderID)

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

	visaFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "2. Data Visa")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, visaFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[VISA-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[VISA-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}
