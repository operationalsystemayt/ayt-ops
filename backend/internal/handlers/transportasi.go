package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ayt-ops/backend/internal/models"
	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// ── LIST ──────────────────────────────────────────────────────────────────────

func (h *Handler) ListTransportasi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			mt.id::text, mt.trip_id::text,
			mt.jenis::text,
			mt.vendor, mt.tgl_trip::text, mt.tipe_kendaraan, mt.keterangan_rute,
			mt.qty, mt.kategori_usia,
			mt.harga_jpy, mt.harga_idr, mt.total_idr, mt.kurs,
			mt.harga_satuan,
			mt.nota_drive_file_id,
			ps.deadline::text,
			mt.payment_schedule_id::text,
			mt.created_at, mt.updated_at
		FROM manifest_transportasi mt
		LEFT JOIN payment_schedules ps ON ps.id = mt.payment_schedule_id
		WHERE mt.trip_id = $1::uuid
		ORDER BY mt.jenis DESC, mt.created_at`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.ManifestTransportasi{}
	for rows.Next() {
		var item models.ManifestTransportasi
		if err := rows.Scan(
			&item.ID, &item.TripID,
			&item.Jenis,
			&item.Vendor, &item.TglTrip, &item.TipeKendaraan, &item.KeteranganRute,
			&item.Qty, &item.KategoriUsia,
			&item.HargaJpy, &item.HargaIdr, &item.TotalIdr, &item.Kurs,
			&item.HargaSatuan,
			&item.NotaDriveFileId,
			&item.WaktuPembayaran,
			&item.PaymentScheduleId,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			jsonErr(w, 500, err.Error())
			return
		}
		list = append(list, item)
	}
	jsonOK(w, list)
}

// ── CREATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) CreateTransportasi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		Jenis           string   `json:"jenis"`
		Vendor          *string  `json:"vendor"`
		TglTrip         *string  `json:"tgl_trip"`
		TipeKendaraan   *string  `json:"tipe_kendaraan"`
		KeteranganRute  *string  `json:"keterangan_rute"`
		Qty             *int     `json:"qty"`
		KategoriUsia    *string  `json:"kategori_usia"`
		HargaJpy        *float64 `json:"harga_jpy"`
		HargaIdr        *float64 `json:"harga_idr"`
		TotalIdr        *float64 `json:"total_idr"`
		Kurs            *float64 `json:"kurs"`
		HargaSatuan     *string  `json:"harga_satuan"`
		NotaDriveFileId *string  `json:"nota_drive_file_id"`
		WaktuPembayaran *string  `json:"waktu_pembayaran"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_idr
	if body.HargaIdr == nil && body.HargaJpy != nil && body.Kurs != nil {
		if strings.ToUpper(body.Jenis) == "SHINKANSEN" && body.Qty != nil {
			v := float64(*body.Qty) * *body.HargaJpy * *body.Kurs
			body.HargaIdr = &v
		} else {
			v := *body.HargaJpy * *body.Kurs
			body.HargaIdr = &v
		}
	}

	ctx := r.Context()

	// Create payment schedule if waktu_pembayaran + harga_idr set
	var paymentScheduleID *string
	if body.WaktuPembayaran != nil && *body.WaktuPembayaran != "" &&
		body.HargaIdr != nil && *body.HargaIdr > 0 {
		var psID string
		err := h.DB.QueryRow(ctx, `
			INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
			VALUES ($1::uuid, 'TRANSPORTASI', $2, $3::date, $4)
			RETURNING id::text`,
			tripID, body.KeteranganRute, body.WaktuPembayaran, body.HargaIdr,
		).Scan(&psID)
		if err != nil {
			jsonErr(w, 500, "create payment_schedule: "+err.Error())
			return
		}
		paymentScheduleID = &psID
	}

	var item models.ManifestTransportasi
	err := h.DB.QueryRow(ctx, `
		INSERT INTO manifest_transportasi
		  (trip_id, jenis, vendor, tgl_trip, tipe_kendaraan, keterangan_rute,
		   qty, kategori_usia, harga_jpy, harga_idr, total_idr, kurs,
		   harga_satuan, nota_drive_file_id, payment_schedule_id)
		VALUES
		  ($1::uuid, $2::transport_jenis, $3, $4::date, $5, $6,
		   $7, $8, $9, $10, $11, $12,
		   $13, $14, $15::uuid)
		RETURNING
			id::text, trip_id::text,
			jenis::text,
			vendor, tgl_trip::text, tipe_kendaraan, keterangan_rute,
			qty, kategori_usia,
			harga_jpy, harga_idr, total_idr, kurs,
			harga_satuan,
			nota_drive_file_id,
			payment_schedule_id::text,
			created_at, updated_at`,
		tripID, body.Jenis, body.Vendor, body.TglTrip, body.TipeKendaraan, body.KeteranganRute,
		body.Qty, body.KategoriUsia, body.HargaJpy, body.HargaIdr, body.TotalIdr, body.Kurs,
		body.HargaSatuan, body.NotaDriveFileId, paymentScheduleID,
	).Scan(
		&item.ID, &item.TripID,
		&item.Jenis,
		&item.Vendor, &item.TglTrip, &item.TipeKendaraan, &item.KeteranganRute,
		&item.Qty, &item.KategoriUsia,
		&item.HargaJpy, &item.HargaIdr, &item.TotalIdr, &item.Kurs,
		&item.HargaSatuan,
		&item.NotaDriveFileId,
		&item.PaymentScheduleId,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	item.WaktuPembayaran = body.WaktuPembayaran

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) UpdateTransportasi(w http.ResponseWriter, r *http.Request) {
	tid := chi.URLParam(r, "tid")
	tripID := chi.URLParam(r, "id")
	var body struct {
		Jenis           *string  `json:"jenis"`
		Vendor          *string  `json:"vendor"`
		TglTrip         *string  `json:"tgl_trip"`
		TipeKendaraan   *string  `json:"tipe_kendaraan"`
		KeteranganRute  *string  `json:"keterangan_rute"`
		Qty             *int     `json:"qty"`
		KategoriUsia    *string  `json:"kategori_usia"`
		HargaJpy        *float64 `json:"harga_jpy"`
		HargaIdr        *float64 `json:"harga_idr"`
		TotalIdr        *float64 `json:"total_idr"`
		Kurs            *float64 `json:"kurs"`
		HargaSatuan     *string  `json:"harga_satuan"`
		NotaDriveFileId *string  `json:"nota_drive_file_id"`
		WaktuPembayaran *string  `json:"waktu_pembayaran"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_idr
	if body.HargaIdr == nil && body.HargaJpy != nil && body.Kurs != nil {
		if body.Jenis != nil && strings.ToUpper(*body.Jenis) == "SHINKANSEN" && body.Qty != nil {
			v := float64(*body.Qty) * *body.HargaJpy * *body.Kurs
			body.HargaIdr = &v
		} else {
			v := *body.HargaJpy * *body.Kurs
			body.HargaIdr = &v
		}
	}

	ctx := r.Context()

	// Upsert payment schedule
	if body.WaktuPembayaran != nil && *body.WaktuPembayaran != "" &&
		body.HargaIdr != nil && *body.HargaIdr > 0 {
		var existingPSID *string
		h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_transportasi WHERE id = $1::uuid`, tid).Scan(&existingPSID)

		if existingPSID != nil {
			h.DB.Exec(ctx, `
				UPDATE payment_schedules SET deadline = $1::date, amount = $2, deskripsi = $3 WHERE id = $4::uuid`,
				body.WaktuPembayaran, body.HargaIdr, body.KeteranganRute, *existingPSID)
		} else {
			var psID string
			err := h.DB.QueryRow(ctx, `
				INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
				VALUES ($1::uuid, 'TRANSPORTASI', $2, $3::date, $4)
				RETURNING id::text`,
				tripID, body.KeteranganRute, body.WaktuPembayaran, body.HargaIdr,
			).Scan(&psID)
			if err == nil {
				h.DB.Exec(ctx, `UPDATE manifest_transportasi SET payment_schedule_id = $1::uuid WHERE id = $2::uuid`, psID, tid)
			}
		}
	}

	_, err := h.DB.Exec(ctx, `
		UPDATE manifest_transportasi SET
			jenis            = COALESCE($2::transport_jenis, jenis),
			vendor           = COALESCE($3, vendor),
			tgl_trip         = COALESCE($4::date, tgl_trip),
			tipe_kendaraan   = COALESCE($5, tipe_kendaraan),
			keterangan_rute  = COALESCE($6, keterangan_rute),
			qty              = COALESCE($7, qty),
			kategori_usia    = COALESCE($8, kategori_usia),
			harga_jpy        = COALESCE($9, harga_jpy),
			harga_idr        = COALESCE($10, harga_idr),
			total_idr        = COALESCE($11, total_idr),
			kurs             = COALESCE($12, kurs),
			harga_satuan     = COALESCE($13, harga_satuan),
			nota_drive_file_id = COALESCE($14, nota_drive_file_id),
			updated_at       = $15
		WHERE id = $1::uuid`,
		tid, nilIfEmpty(body.Jenis), body.Vendor, body.TglTrip, body.TipeKendaraan, body.KeteranganRute,
		body.Qty, body.KategoriUsia, body.HargaJpy, body.HargaIdr, body.TotalIdr, body.Kurs,
		body.HargaSatuan, body.NotaDriveFileId, time.Now(),
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteTransportasi(w http.ResponseWriter, r *http.Request) {
	tid := chi.URLParam(r, "tid")
	ctx := r.Context()

	var psID *string
	h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_transportasi WHERE id = $1::uuid`, tid).Scan(&psID)

	_, err := h.DB.Exec(ctx, `DELETE FROM manifest_transportasi WHERE id = $1::uuid`, tid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	if psID != nil {
		h.DB.Exec(ctx, `DELETE FROM payment_schedules WHERE id = $1::uuid`, *psID)
	}

	w.WriteHeader(204)
}

// ── UPLOAD NOTA ───────────────────────────────────────────────────────────────

func (h *Handler) UploadNotaTransportasi(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
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

	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx, `SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID).
		Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	log.Printf("[NOTA-TRANSPORTASI] uploading file=%s trip=%s", header.Filename, tripID)

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

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "6. Data Transportasi")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".pdf"
	}
	fileName := header.Filename
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		if strings.ToLower(ext) == ".pdf" {
			mimeType = "application/pdf"
		} else {
			mimeType = detectMime(mimeType, header.Filename)
		}
	}

	fileID, viewURL, err := drv.UploadFile(ctx, subFolder, fileName, mimeType, file)
	if err != nil {
		log.Printf("[NOTA-TRANSPORTASI] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[NOTA-TRANSPORTASI] uploaded: fileID=%s url=%s", fileID, viewURL)

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── OCR NOTA ──────────────────────────────────────────────────────────────────

const transportasiOcrPrompt = `Baca dokumen PDF nota transportasi ini dan kembalikan HANYA JSON valid berikut (tanpa markdown, tanpa teks lain):

{
  "shinkansen": [
    {
      "kategori_usia": "0 - 1 Th",
      "aturan_harga": "Free",
      "qty": 0,
      "harga_jpy": 0,
      "kurs": 0
    },
    {
      "kategori_usia": "1 - 5 Th",
      "aturan_harga": "Gratis tanpa kursi / 50% jika ambil kursi",
      "qty": 0,
      "harga_jpy": 0,
      "kurs": 0
    },
    {
      "kategori_usia": "6 - 11 Th",
      "aturan_harga": "50% dari harga dewasa",
      "qty": 0,
      "harga_jpy": 0,
      "kurs": 0
    },
    {
      "kategori_usia": "12+ Th",
      "aturan_harga": "Harga dewasa (100%)",
      "qty": 0,
      "harga_jpy": 0,
      "kurs": 0
    }
  ],
  "lokal": [
    {
      "vendor": "nama agent",
      "tgl_trip": "YYYY-MM-DD",
      "tipe_kendaraan": "2 Hiace 1 Alphard",
      "keterangan": "deskripsi rute",
      "harga_jpy": 0,
      "harga_satuan": "teks harga satuan",
      "kurs": 0
    }
  ]
}

ATURAN:
- Selalu sertakan 4 baris shinkansen dengan kategori_usia yang persis: "0 - 1 Th", "1 - 5 Th", "6 - 11 Th", "12+ Th"
- Isi qty dan harga_jpy dari dokumen, 0 jika tidak ada
- kurs dari dokumen, 0 jika tidak ada
- lokal: isi semua baris transportasi lokal dari dokumen
- Kembalikan JSON saja, tanpa penjelasan`

func (h *Handler) OcrNotaTransportasi(w http.ResponseWriter, r *http.Request) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		jsonErr(w, 503, "ANTHROPIC_API_KEY not configured")
		return
	}

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "field 'file' required")
		return
	}
	defer file.Close()

	log.Printf("[OCR-TRANSPORTASI] received file: %s | size: %d bytes", header.Filename, header.Size)

	data, err := io.ReadAll(file)
	if err != nil {
		jsonErr(w, 500, "failed to read file")
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	log.Printf("[OCR-TRANSPORTASI] sending to Anthropic (%d bytes base64)...", len(b64))

	reqBody := map[string]any{
		"model":      "claude-opus-4-8",
		"max_tokens": 2048,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{
					"type": "document",
					"source": map[string]any{
						"type":       "base64",
						"media_type": "application/pdf",
						"data":       b64,
					},
				},
				{"type": "text", "text": transportasiOcrPrompt},
			},
		}},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequestWithContext(r.Context(), "POST",
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("anthropic-beta", "pdfs-2024-09-25")
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		jsonErr(w, 502, "anthropic request failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	log.Printf("[OCR-TRANSPORTASI] anthropic response status: %d", resp.StatusCode)

	var apiResp struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		jsonErr(w, 502, "failed to parse anthropic response")
		return
	}
	if apiResp.Error != nil {
		jsonErr(w, 502, "anthropic error: "+apiResp.Error.Message)
		return
	}
	if len(apiResp.Content) == 0 {
		jsonErr(w, 502, "empty response from anthropic")
		return
	}

	text := strings.TrimSpace(apiResp.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	log.Printf("[OCR-TRANSPORTASI] raw result: %s", text)

	var result models.TransportasiOCRResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		jsonErr(w, 502, "ocr parse error: "+err.Error())
		return
	}

	log.Printf("[OCR-TRANSPORTASI] success: shinkansen=%d lokal=%d",
		len(result.Shinkansen), len(result.Lokal))
	jsonOK(w, result)
}

// ── CSV: shared builder ───────────────────────────────────────────────────────

type transportasiCSVRow struct {
	Jenis          string
	Vendor         string
	TglTrip        string
	TipeKendaraan  string
	KeteranganRute string
	Qty            int
	KategoriUsia   string
	HargaJpy       float64
	HargaIdr       float64
	TotalIdr       float64
	Kurs           float64
	HargaSatuan    string
}

func (h *Handler) buildTransportasiCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
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
			COALESCE(mt.jenis::text,''),
			COALESCE(mt.vendor,''),
			COALESCE(mt.tgl_trip::text,''),
			COALESCE(mt.tipe_kendaraan,''),
			COALESCE(mt.keterangan_rute,''),
			COALESCE(mt.qty,0),
			COALESCE(mt.kategori_usia,''),
			COALESCE(mt.harga_jpy,0),
			COALESCE(mt.harga_idr,0),
			COALESCE(mt.total_idr,0),
			COALESCE(mt.kurs,0),
			COALESCE(mt.harga_satuan,'')
		FROM manifest_transportasi mt
		WHERE mt.trip_id = $1::uuid
		ORDER BY mt.jenis DESC, mt.created_at`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	var dataRows []transportasiCSVRow
	for rows.Next() {
		var dr transportasiCSVRow
		if err := rows.Scan(
			&dr.Jenis, &dr.Vendor, &dr.TglTrip, &dr.TipeKendaraan,
			&dr.KeteranganRute, &dr.Qty, &dr.KategoriUsia,
			&dr.HargaJpy, &dr.HargaIdr, &dr.TotalIdr, &dr.Kurs, &dr.HargaSatuan,
		); err != nil {
			continue
		}
		dataRows = append(dataRows, dr)
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	numCols := 8
	emptyRow := make([]string, numCols)

	// ── Header ────────────────────────────────────────────────────────────────
	headerRow := make([]string, numCols)
	headerRow[0] = strings.ToUpper(namaTrip)
	cw.Write(headerRow)

	dateRow := make([]string, numCols)
	dateRow[0] = tripDateRange(tglBerangkat, tglPulang)
	cw.Write(dateRow)
	cw.Write(emptyRow)
	cw.Write(emptyRow)

	// ── SHINKANSEN section ───────────────────────────────────────────────────
	shinRow := make([]string, numCols)
	shinRow[0] = "SHINKANSEN"
	cw.Write(shinRow)

	// Column headers for shinkansen
	cw.Write([]string{
		"Kategori Usia", "Aturan Harga", "Qty", "Harga Beli OTS", "Total JPY", "Total Rp", "Kurs", "",
	})

	// Filter shinkansen rows — preserve order by kategori
	shinOrder := []string{"0 - 1 Th", "1 - 5 Th", "6 - 11 Th", "6 – 11 tahun", "12+ Th", "12+ tahun"}
	shinMap := map[string]transportasiCSVRow{}
	var shinRows []transportasiCSVRow
	for _, dr := range dataRows {
		if strings.ToUpper(dr.Jenis) == "SHINKANSEN" {
			shinMap[dr.KategoriUsia] = dr
		}
	}
	// Build in canonical order
	seen := map[string]bool{}
	for _, k := range shinOrder {
		if dr, ok := shinMap[k]; ok && !seen[dr.KategoriUsia] {
			seen[dr.KategoriUsia] = true
			shinRows = append(shinRows, dr)
		}
	}
	// Any remaining shinkansen rows not in the canonical order
	for _, dr := range dataRows {
		if strings.ToUpper(dr.Jenis) == "SHINKANSEN" && !seen[dr.KategoriUsia] {
			seen[dr.KategoriUsia] = true
			shinRows = append(shinRows, dr)
		}
	}

	// Get kurs from shinkansen (first non-zero)
	shinKurs := 0.0
	for _, dr := range shinRows {
		if dr.Kurs > 0 {
			shinKurs = dr.Kurs
			break
		}
	}

	var shinTotalQty int
	var shinTotalJpy float64
	var shinTotalIdr float64

	for _, dr := range shinRows {
		totalJpy := float64(dr.Qty) * dr.HargaJpy
		idrVal := dr.HargaIdr
		shinTotalQty += dr.Qty
		shinTotalJpy += totalJpy
		shinTotalIdr += idrVal

		hargaOtsStr := ""
		if dr.HargaJpy > 0 {
			hargaOtsStr = fmt.Sprintf("¥%s", formatIDR(dr.HargaJpy))
		} else {
			hargaOtsStr = "¥0"
		}
		totalJpyStr := ""
		if totalJpy > 0 {
			totalJpyStr = fmt.Sprintf("¥%s", formatIDR(totalJpy))
		} else {
			totalJpyStr = "¥0"
		}
		totalIdrStr := ""
		if idrVal > 0 {
			totalIdrStr = fmt.Sprintf("Rp%s", formatIDR(idrVal))
		}
		kursStr := ""
		if dr.Kurs > 0 {
			kursStr = fmt.Sprintf("Rp%s", formatIDR(dr.Kurs))
		}

		cw.Write([]string{
			dr.KategoriUsia,
			dr.KeteranganRute, // aturan_harga stored in keterangan_rute
			fmt.Sprintf("%d", dr.Qty),
			hargaOtsStr,
			totalJpyStr,
			totalIdrStr,
			kursStr,
			"",
		})
	}

	// Shinkansen Total row
	shinTotalJpyStr := fmt.Sprintf("¥%s", formatIDR(shinTotalJpy))
	shinTotalIdrStr := ""
	if shinTotalIdr > 0 {
		shinTotalIdrStr = fmt.Sprintf("Rp%s", formatIDR(shinTotalIdr))
	}
	_ = shinKurs
	cw.Write([]string{
		"Total",
		"",
		fmt.Sprintf("%d", shinTotalQty),
		fmt.Sprintf("¥%s", formatIDR(0)),
		shinTotalJpyStr,
		shinTotalIdrStr,
		"",
		"",
	})

	cw.Write(emptyRow)
	cw.Write(emptyRow)

	// ── TRANSPORTASI LOKAL section ────────────────────────────────────────────
	lokalRow := make([]string, numCols)
	lokalRow[0] = "Transportasi Lokal"
	cw.Write(lokalRow)

	// Column headers for lokal
	cw.Write([]string{
		"Agent", "Tgl Trip", "Type Of Cars", "Keterangan", "Harga Total", "Harga Satuan", "Total Rp", "Kurs",
	})

	// Filter lokal rows
	var lokalRows []transportasiCSVRow
	for _, dr := range dataRows {
		if strings.ToUpper(dr.Jenis) == "LOKAL" {
			lokalRows = append(lokalRows, dr)
		}
	}

	prevVendor := ""
	prevKurs := 0.0
	var lokalTotalJpy float64
	var lokalTotalIdr float64

	for _, dr := range lokalRows {
		lokalTotalJpy += dr.HargaJpy
		lokalTotalIdr += dr.HargaIdr

		// Vendor deduplication
		vendorStr := ""
		if dr.Vendor != prevVendor {
			vendorStr = dr.Vendor
			prevVendor = dr.Vendor
		}

		// Kurs deduplication
		kursStr := ""
		if dr.Kurs != 0 && dr.Kurs != prevKurs {
			kursStr = fmt.Sprintf("Rp%s", formatIDR(dr.Kurs))
			prevKurs = dr.Kurs
		}

		// Format date
		tglStr := fmtDateLokal(dr.TglTrip)

		hargaJpyStr := ""
		if dr.HargaJpy > 0 {
			hargaJpyStr = fmt.Sprintf("¥%s", formatIDR(dr.HargaJpy))
		}
		hargaIdrStr := ""
		if dr.HargaIdr > 0 {
			hargaIdrStr = fmt.Sprintf("Rp%s", formatIDR(dr.HargaIdr))
		}

		cw.Write([]string{
			vendorStr,
			tglStr,
			dr.TipeKendaraan,
			dr.KeteranganRute,
			hargaJpyStr,
			dr.HargaSatuan,
			hargaIdrStr,
			kursStr,
		})
	}

	// Lokal Total row
	lokalTotalJpyStr := ""
	if lokalTotalJpy > 0 {
		lokalTotalJpyStr = fmt.Sprintf("¥%s", formatIDR(lokalTotalJpy))
	}
	lokalTotalIdrStr := ""
	if lokalTotalIdr > 0 {
		lokalTotalIdrStr = fmt.Sprintf("Rp%s", formatIDR(lokalTotalIdr))
	}
	cw.Write([]string{
		"Total", "", "", "", lokalTotalJpyStr, "", lokalTotalIdrStr, "",
	})

	cw.Flush()

	fileName := fmt.Sprintf("manifest_transportasi_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// fmtDateLokal formats "2006-01-02" → "2 Jan" (short form like "29 Jan", "1 Feb")
func fmtDateLokal(s string) string {
	if s == "" {
		return ""
	}
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return s
	}
	return fmt.Sprintf("%d %s", d.Day(), d.Format("Jan"))
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportTransportasiCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildTransportasiCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadTransportasiCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildTransportasiCSV(r, tripID)
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

	transportasiFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "6. Data Transportasi")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, transportasiFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[TRANSPORTASI-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[TRANSPORTASI-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}
