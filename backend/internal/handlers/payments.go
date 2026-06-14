package handlers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ayt-ops/backend/internal/models"
	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) ListPayments(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id::text, p.trip_id::text, p.peserta_id::text, mp.nama_lengkap,
		       p.jenis::text, p.amount, p.tgl_bayar::text, p.bukti_drive_file_id,
		       p.catatan, p.created_by, p.created_at, p.updated_at
		FROM trip_payments p
		LEFT JOIN manifest_peserta mp ON mp.id = p.peserta_id
		WHERE p.trip_id = $1::uuid
		ORDER BY p.created_at DESC`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	list := []models.TripPayment{}
	for rows.Next() {
		var p models.TripPayment
		if err := rows.Scan(&p.ID, &p.TripID, &p.PesertaID, &p.NamaPeserta,
			&p.Jenis, &p.Amount, &p.TglBayar, &p.BuktiDriveFileID,
			&p.Catatan, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, p)
	}
	jsonOK(w, list)
}

func (h *Handler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		// Try JSON fallback for backward compatibility
		var body struct {
			PesertaID *string `json:"peserta_id"`
			Jenis     string  `json:"jenis"`
			Amount    float64 `json:"amount"`
			TglBayar  string  `json:"tgl_bayar"`
			Catatan   *string `json:"catatan"`
			CreatedBy *string `json:"created_by"`
		}
		if decErr := decode(r, &body); decErr != nil {
			jsonErr(w, 400, "invalid body"); return
		}
		if body.Amount <= 0 || body.TglBayar == "" {
			jsonErr(w, 400, "amount and tgl_bayar required"); return
		}
		if body.Jenis == "" {
			body.Jenis = "dp"
		}
		var p models.TripPayment
		err2 := h.DB.QueryRow(ctx, `
			INSERT INTO trip_payments (trip_id, peserta_id, jenis, amount, tgl_bayar, catatan, created_by)
			VALUES ($1::uuid, $2::uuid, $3::payment_jenis, $4, $5::date, $6, $7)
			RETURNING id::text, trip_id::text, peserta_id::text, NULL::text,
			          jenis::text, amount, tgl_bayar::text, bukti_drive_file_id,
			          catatan, created_by, created_at, updated_at`,
			tripID, body.PesertaID, body.Jenis, body.Amount, body.TglBayar,
			body.Catatan, body.CreatedBy,
		).Scan(&p.ID, &p.TripID, &p.PesertaID, &p.NamaPeserta,
			&p.Jenis, &p.Amount, &p.TglBayar, &p.BuktiDriveFileID,
			&p.Catatan, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
		if err2 != nil {
			jsonErr(w, 500, err2.Error()); return
		}
		w.WriteHeader(201)
		jsonOK(w, p)
		return
	}

	// Multipart form
	pesertaID := r.FormValue("peserta_id")
	jenis := r.FormValue("jenis")
	if jenis == "" {
		jenis = "dp"
	}
	amountStr := r.FormValue("amount")
	tglBayar := r.FormValue("tgl_bayar")
	catatan := r.FormValue("catatan")
	createdBy := r.FormValue("created_by")

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil || amount <= 0 {
		jsonErr(w, 400, "amount must be a positive number"); return
	}
	if tglBayar == "" {
		jsonErr(w, 400, "tgl_bayar required"); return
	}

	var pesertaIDPtr *string
	if pesertaID != "" {
		pesertaIDPtr = &pesertaID
	}
	var catatanPtr *string
	if catatan != "" {
		catatanPtr = &catatan
	}
	var createdByPtr *string
	if createdBy != "" {
		createdByPtr = &createdBy
	}

	// Optional bukti file upload
	var buktiDriveFileID *string
	buktiFile, buktiHeader, buktiErr := r.FormFile("bukti")
	if buktiErr == nil {
		defer buktiFile.Close()

		// Get trip info for Drive folder
		var namaTrip string
		var driveFolderID *string
		err = h.DB.QueryRow(ctx,
			`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
			tripID,
		).Scan(&namaTrip, &driveFolderID)
		if err != nil {
			jsonErr(w, 404, "trip not found"); return
		}

		// Get peserta name if peserta_id provided
		pesertaNama := "umum"
		if pesertaIDPtr != nil {
			var nm string
			if scanErr := h.DB.QueryRow(ctx,
				`SELECT nama_lengkap FROM manifest_peserta WHERE id = $1::uuid`,
				*pesertaIDPtr,
			).Scan(&nm); scanErr == nil {
				pesertaNama = nm
			}
		}

		drv, drvErr := services.NewDriveService(ctx)
		if drvErr != nil {
			jsonErr(w, 503, drvErr.Error()); return
		}

		folderID, fErr := h.ensureTripFolder(ctx, drv, tripID)
		if fErr != nil {
			jsonErr(w, 500, "create trip folder: "+fErr.Error()); return
		}
		driveFolderID = &folderID

		paymentFolder, fErr := drv.EnsureFolder(ctx, *driveFolderID, "13. Data Pembayaran")
		if fErr != nil {
			jsonErr(w, 500, fErr.Error()); return
		}

		ext := filepath.Ext(buktiHeader.Filename)
		if ext == "" {
			ext = ".pdf"
		}
		// Filename: {peserta_nama}_{tgl}_{original_filename}
		tglForName := strings.ReplaceAll(tglBayar, "-", "")
		uploadFileName := fmt.Sprintf("%s_%s_%s", slugifyName(pesertaNama), tglForName, buktiHeader.Filename)
		mimeType := buktiHeader.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			mimeType = detectMime(mimeType, buktiHeader.Filename)
		}

		fileID, _, uploadErr := drv.UploadFile(ctx, paymentFolder, uploadFileName, mimeType, buktiFile)
		if uploadErr != nil {
			log.Printf("[PAYMENT] bukti upload error: %v", uploadErr)
			jsonErr(w, 500, "drive upload failed: "+uploadErr.Error()); return
		}
		buktiDriveFileID = &fileID
		log.Printf("[PAYMENT] bukti uploaded: fileID=%s", fileID)
	}

	var p models.TripPayment
	err = h.DB.QueryRow(ctx, `
		INSERT INTO trip_payments (trip_id, peserta_id, jenis, amount, tgl_bayar, bukti_drive_file_id, catatan, created_by)
		VALUES ($1::uuid, $2::uuid, $3::payment_jenis, $4, $5::date, $6, $7, $8)
		RETURNING id::text, trip_id::text, peserta_id::text, NULL::text,
		          jenis::text, amount, tgl_bayar::text, bukti_drive_file_id,
		          catatan, created_by, created_at, updated_at`,
		tripID, pesertaIDPtr, jenis, amount, tglBayar, buktiDriveFileID, catatanPtr, createdByPtr,
	).Scan(&p.ID, &p.TripID, &p.PesertaID, &p.NamaPeserta,
		&p.Jenis, &p.Amount, &p.TglBayar, &p.BuktiDriveFileID,
		&p.Catatan, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(201)
	jsonOK(w, p)
}

func (h *Handler) UpdatePayment(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	payID := chi.URLParam(r, "pay")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "invalid form"); return
	}

	pesertaID := r.FormValue("peserta_id")
	jenis := r.FormValue("jenis")
	if jenis == "" {
		jenis = "dp"
	}
	amountStr := r.FormValue("amount")
	tglBayar := r.FormValue("tgl_bayar")
	catatan := r.FormValue("catatan")

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil || amount <= 0 {
		jsonErr(w, 400, "amount must be a positive number"); return
	}
	if tglBayar == "" {
		jsonErr(w, 400, "tgl_bayar required"); return
	}

	var pesertaIDPtr *string
	if pesertaID != "" {
		pesertaIDPtr = &pesertaID
	}
	var catatanPtr *string
	if catatan != "" {
		catatanPtr = &catatan
	}

	// Optional bukti file re-upload
	var buktiDriveFileID *string
	buktiFile, buktiHeader, buktiErr := r.FormFile("bukti")
	if buktiErr == nil {
		defer buktiFile.Close()

		var namaTrip string
		var driveFolderID *string
		err = h.DB.QueryRow(ctx,
			`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
			tripID,
		).Scan(&namaTrip, &driveFolderID)
		if err != nil {
			jsonErr(w, 404, "trip not found"); return
		}

		pesertaNama := "umum"
		if pesertaIDPtr != nil {
			var nm string
			if scanErr := h.DB.QueryRow(ctx,
				`SELECT nama_lengkap FROM manifest_peserta WHERE id = $1::uuid`,
				*pesertaIDPtr,
			).Scan(&nm); scanErr == nil {
				pesertaNama = nm
			}
		}

		drv, drvErr := services.NewDriveService(ctx)
		if drvErr != nil {
			jsonErr(w, 503, drvErr.Error()); return
		}

		folderID, fErr := h.ensureTripFolder(ctx, drv, tripID)
		if fErr != nil {
			jsonErr(w, 500, "create trip folder: "+fErr.Error()); return
		}
		driveFolderID = &folderID

		paymentFolder, fErr := drv.EnsureFolder(ctx, *driveFolderID, "13. Data Pembayaran")
		if fErr != nil {
			jsonErr(w, 500, fErr.Error()); return
		}

		tglForName := strings.ReplaceAll(tglBayar, "-", "")
		uploadFileName := fmt.Sprintf("%s_%s_%s", slugifyName(pesertaNama), tglForName, buktiHeader.Filename)
		mimeType := buktiHeader.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			mimeType = detectMime(mimeType, buktiHeader.Filename)
		}

		fileID, _, uploadErr := drv.UploadFile(ctx, paymentFolder, uploadFileName, mimeType, buktiFile)
		if uploadErr != nil {
			log.Printf("[PAYMENT] bukti upload error: %v", uploadErr)
			jsonErr(w, 500, "drive upload failed: "+uploadErr.Error()); return
		}
		buktiDriveFileID = &fileID
		log.Printf("[PAYMENT] bukti re-uploaded: fileID=%s", fileID)
	}

	_, err = h.DB.Exec(ctx, `
		UPDATE trip_payments SET
		  peserta_id          = $3::uuid,
		  jenis               = $4::payment_jenis,
		  amount              = $5,
		  tgl_bayar           = $6::date,
		  catatan             = $7,
		  bukti_drive_file_id = COALESCE($8, bukti_drive_file_id),
		  updated_at          = NOW()
		WHERE id = $1::uuid AND trip_id = $2::uuid`,
		payID, tripID, pesertaIDPtr, jenis, amount, tglBayar, catatanPtr, buktiDriveFileID,
	)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	var p models.TripPayment
	err = h.DB.QueryRow(ctx, `
		SELECT p.id::text, p.trip_id::text, p.peserta_id::text, mp.nama_lengkap,
		       p.jenis::text, p.amount, p.tgl_bayar::text, p.bukti_drive_file_id,
		       p.catatan, p.created_by, p.created_at, p.updated_at
		FROM trip_payments p
		LEFT JOIN manifest_peserta mp ON mp.id = p.peserta_id
		WHERE p.id = $1::uuid`, payID,
	).Scan(&p.ID, &p.TripID, &p.PesertaID, &p.NamaPeserta,
		&p.Jenis, &p.Amount, &p.TglBayar, &p.BuktiDriveFileID,
		&p.Catatan, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	jsonOK(w, p)
}

func (h *Handler) DeletePayment(w http.ResponseWriter, r *http.Request) {
	payID := chi.URLParam(r, "pay")
	ctx := r.Context()

	// Get bukti_drive_file_id before deleting
	var buktiFileID *string
	h.DB.QueryRow(ctx,
		`SELECT bukti_drive_file_id FROM trip_payments WHERE id = $1::uuid`,
		payID,
	).Scan(&buktiFileID)

	_, err := h.DB.Exec(ctx, `DELETE FROM trip_payments WHERE id = $1::uuid`, payID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	// Best-effort Drive delete
	if buktiFileID != nil && *buktiFileID != "" {
		drv, drvErr := services.NewDriveService(ctx)
		if drvErr == nil {
			if delErr := drv.DeleteFile(ctx, *buktiFileID); delErr != nil {
				log.Printf("[PAYMENT] delete bukti file %s: %v (best effort)", *buktiFileID, delErr)
			}
		}
	}

	w.WriteHeader(204)
}

// ── CSV builder ───────────────────────────────────────────────────────────────

type paymentCSVRow struct {
	No          int
	Peserta     string
	Jenis       string
	Amount      float64
	TglBayar    string
	Catatan     string
}

func (h *Handler) buildPaymentsCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
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
			ROW_NUMBER() OVER (ORDER BY p.created_at) AS no,
			COALESCE(mp.nama_lengkap, 'Umum'),
			p.jenis::text,
			p.amount,
			p.tgl_bayar::text,
			COALESCE(p.catatan, '')
		FROM trip_payments p
		LEFT JOIN manifest_peserta mp ON mp.id = p.peserta_id
		WHERE p.trip_id = $1::uuid
		ORDER BY p.created_at`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	var dataRows []paymentCSVRow
	var grandTotal float64
	for rows.Next() {
		var dr paymentCSVRow
		if err := rows.Scan(&dr.No, &dr.Peserta, &dr.Jenis, &dr.Amount, &dr.TglBayar, &dr.Catatan); err != nil {
			continue
		}
		grandTotal += dr.Amount
		dataRows = append(dataRows, dr)
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	numCols := 6
	emptyRow := make([]string, numCols)

	// Header block
	hdrRow := make([]string, numCols)
	hdrRow[0] = "DATA PEMBAYARAN " + strings.ToUpper(namaTrip)
	cw.Write(hdrRow)

	dateRow := make([]string, numCols)
	dateRow[0] = tripDateRange(tglBerangkat, tglPulang)
	cw.Write(dateRow)

	cw.Write(emptyRow)

	// Column headers
	cw.Write([]string{"NO", "PESERTA", "JENIS", "AMOUNT", "TGL BAYAR", "CATATAN"})

	// Data rows
	for _, dr := range dataRows {
		cw.Write([]string{
			fmt.Sprintf("%d", dr.No),
			dr.Peserta,
			strings.ToUpper(dr.Jenis),
			fmt.Sprintf("Rp%s", formatIDR(dr.Amount)),
			dr.TglBayar,
			dr.Catatan,
		})
	}

	// Footer
	totalRow := make([]string, numCols)
	totalRow[1] = "TOTAL"
	totalRow[3] = fmt.Sprintf("Rp%s", formatIDR(grandTotal))
	cw.Write(totalRow)

	cw.Flush()

	fileName := fmt.Sprintf("manifest_payment_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportPaymentsCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildPaymentsCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadPaymentsCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildPaymentsCSV(r, tripID)
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

	paymentFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "13. Data Pembayaran")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, paymentFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[PAYMENT-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[PAYMENT-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}
