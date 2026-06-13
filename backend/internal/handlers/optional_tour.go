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
	"strconv"
	"strings"
	"time"

	"ayt-ops/backend/internal/models"
	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// ── LIST ──────────────────────────────────────────────────────────────────────

func (h *Handler) ListOptionalTour(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			mot.id::text, mot.trip_id::text,
			mot.nama_tour, mot.kategori,
			mot.tanggal::text,
			mot.harga_jual_idr, mot.harga_jual_kurs,
			mot.harga_beli_jpy, mot.harga_beli_idr, mot.kurs,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(mot.peserta_ids)),
				''
			) AS peserta_names,
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(mot.peserta_ids) p),
				'{}'::text[]
			) AS peserta_ids,
			mot.tiket_drive_file_id,
			mot.created_at, mot.updated_at
		FROM manifest_optional_tour mot
		WHERE mot.trip_id = $1::uuid
		ORDER BY mot.created_at DESC`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.ManifestOptionalTour{}
	for rows.Next() {
		var item models.ManifestOptionalTour
		var pesertaNamesStr string
		var pesertaIDsStr []string
		if err := rows.Scan(
			&item.ID, &item.TripID,
			&item.NamaTour, &item.Kategori,
			&item.Tanggal,
			&item.HargaJualIdr, &item.HargaJualKurs,
			&item.HargaBeliJpy, &item.HargaBeliIdr, &item.Kurs,
			&pesertaNamesStr,
			&pesertaIDsStr,
			&item.TiketDriveFileId,
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

// ── CREATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) CreateOptionalTour(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		// Fallback: try plain multipart parse
		if err2 := r.ParseForm(); err2 != nil {
			jsonErr(w, 400, "failed to parse form")
			return
		}
	}

	namaTour := r.FormValue("nama_tour")
	tanggal := r.FormValue("tanggal")
	kategori := r.FormValue("kategori")
	pesertaIdsJSON := r.FormValue("peserta_ids")

	parseF := func(s string) *float64 {
		if s == "" {
			return nil
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil
		}
		return &v
	}

	hargaBeliKurs := parseF(r.FormValue("harga_beli_kurs"))
	kurs := parseF(r.FormValue("kurs"))
	hargaBeliIdr := parseF(r.FormValue("harga_beli_idr"))
	hargaJualKurs := parseF(r.FormValue("harga_jual_kurs"))
	hargaJualIdr := parseF(r.FormValue("harga_jual_idr"))

	// Auto-compute harga_beli_idr
	if (hargaBeliIdr == nil || *hargaBeliIdr == 0) && hargaBeliKurs != nil && kurs != nil {
		v := *hargaBeliKurs * *kurs
		hargaBeliIdr = &v
	}
	// Auto-compute harga_jual_idr
	if (hargaJualIdr == nil || *hargaJualIdr == 0) && hargaJualKurs != nil && kurs != nil {
		v := *hargaJualKurs * *kurs
		hargaJualIdr = &v
	}

	// Parse peserta_ids
	var pesertaIds []string
	if pesertaIdsJSON != "" {
		if err := json.Unmarshal([]byte(pesertaIdsJSON), &pesertaIds); err != nil {
			pesertaIds = []string{}
		}
	}

	// Handle tiket file upload
	var tiketDriveFileId *string
	file, header, fileErr := r.FormFile("tiket")
	if fileErr == nil {
		defer file.Close()

		var namaTrip string
		var driveFolderID *string
		err := h.DB.QueryRow(ctx, `SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID).
			Scan(&namaTrip, &driveFolderID)
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

		subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "7. Data Tiket Opsional Tour")
		if err != nil {
			jsonErr(w, 500, err.Error())
			return
		}

		ext := filepath.Ext(header.Filename)
		if ext == "" {
			ext = ".pdf"
		}
		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			if strings.ToLower(ext) == ".pdf" {
				mimeType = "application/pdf"
			} else {
				mimeType = detectMime(mimeType, header.Filename)
			}
		}

		fileID, _, err := drv.UploadFile(ctx, subFolder, header.Filename, mimeType, file)
		if err != nil {
			log.Printf("[TIKET-OPTIONAL] upload error: %v", err)
			jsonErr(w, 500, "drive upload failed: "+err.Error())
			return
		}
		tiketDriveFileId = &fileID
	}

	pesertaArrLiteral := formatUUIDArray(pesertaIds)

	var tanggalVal interface{}
	if tanggal != "" {
		tanggalVal = tanggal
	}
	var kategoriVal *string
	if kategori != "" {
		kategoriVal = &kategori
	}

	var item models.ManifestOptionalTour
	var pesertaNamesStr string
	var pesertaIDsStr []string

	err := h.DB.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO manifest_optional_tour
		  (trip_id, nama_tour, kategori, tanggal,
		   harga_jual_idr, harga_jual_kurs,
		   harga_beli_jpy, harga_beli_idr, kurs,
		   peserta_ids, tiket_drive_file_id)
		VALUES
		  ($1::uuid, $2, $3, $4::date,
		   $5, $6,
		   $7, $8, $9,
		   %s, $10)
		RETURNING
			id::text, trip_id::text,
			nama_tour, kategori,
			tanggal::text,
			harga_jual_idr, harga_jual_kurs,
			harga_beli_jpy, harga_beli_idr, kurs,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(peserta_ids)),
				''
			),
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(peserta_ids) p),
				'{}'::text[]
			),
			tiket_drive_file_id,
			created_at, updated_at`,
		pesertaArrLiteral),
		tripID, namaTour, kategoriVal, tanggalVal,
		hargaJualIdr, hargaJualKurs,
		hargaBeliKurs, hargaBeliIdr, kurs,
		tiketDriveFileId,
	).Scan(
		&item.ID, &item.TripID,
		&item.NamaTour, &item.Kategori,
		&item.Tanggal,
		&item.HargaJualIdr, &item.HargaJualKurs,
		&item.HargaBeliJpy, &item.HargaBeliIdr, &item.Kurs,
		&pesertaNamesStr,
		&pesertaIDsStr,
		&item.TiketDriveFileId,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	item.PesertaIds = pesertaIDsStr
	if pesertaNamesStr != "" {
		item.PesertaNames = strings.Split(pesertaNamesStr, ", ")
	} else {
		item.PesertaNames = []string{}
	}

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) UpdateOptionalTour(w http.ResponseWriter, r *http.Request) {
	oid := chi.URLParam(r, "oid")
	var body struct {
		NamaTour      *string  `json:"nama_tour"`
		Kategori      *string  `json:"kategori"`
		Tanggal       *string  `json:"tanggal"`
		HargaBeliKurs *float64 `json:"harga_beli_kurs"`
		Kurs          *float64 `json:"kurs"`
		HargaBeliIdr  *float64 `json:"harga_beli_idr"`
		HargaJualKurs *float64 `json:"harga_jual_kurs"`
		HargaJualIdr  *float64 `json:"harga_jual_idr"`
		PesertaIds    []string `json:"peserta_ids"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_beli_idr if not explicitly set
	if (body.HargaBeliIdr == nil || *body.HargaBeliIdr == 0) && body.HargaBeliKurs != nil && body.Kurs != nil {
		v := *body.HargaBeliKurs * *body.Kurs
		body.HargaBeliIdr = &v
	}
	// Auto-compute harga_jual_idr if not explicitly set
	if (body.HargaJualIdr == nil || *body.HargaJualIdr == 0) && body.HargaJualKurs != nil && body.Kurs != nil {
		v := *body.HargaJualKurs * *body.Kurs
		body.HargaJualIdr = &v
	}

	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	_, err := h.DB.Exec(r.Context(), fmt.Sprintf(`
		UPDATE manifest_optional_tour SET
			nama_tour         = COALESCE($2, nama_tour),
			kategori          = COALESCE($3, kategori),
			tanggal           = COALESCE($4::date, tanggal),
			harga_jual_idr    = COALESCE($5, harga_jual_idr),
			harga_jual_kurs   = COALESCE($6, harga_jual_kurs),
			harga_beli_jpy    = COALESCE($7, harga_beli_jpy),
			harga_beli_idr    = COALESCE($8, harga_beli_idr),
			kurs              = COALESCE($9, kurs),
			peserta_ids       = %s,
			updated_at        = $10
		WHERE id = $1::uuid`,
		pesertaArrLiteral),
		oid, body.NamaTour, body.Kategori, body.Tanggal,
		body.HargaJualIdr, body.HargaJualKurs,
		body.HargaBeliKurs, body.HargaBeliIdr, body.Kurs,
		time.Now(),
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteOptionalTour(w http.ResponseWriter, r *http.Request) {
	oid := chi.URLParam(r, "oid")
	ctx := r.Context()

	// Fetch tiket_drive_file_id before deletion (best-effort)
	var tiketID *string
	h.DB.QueryRow(ctx, `SELECT tiket_drive_file_id FROM manifest_optional_tour WHERE id = $1::uuid`, oid).Scan(&tiketID)

	_, err := h.DB.Exec(ctx, `DELETE FROM manifest_optional_tour WHERE id = $1::uuid`, oid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Best-effort delete from Drive
	if tiketID != nil {
		drv, err := services.NewDriveService(ctx)
		if err == nil {
			if delErr := drv.DeleteFile(ctx, *tiketID); delErr != nil {
				log.Printf("[OPTIONAL-TOUR] delete drive file %s: %v (ignored)", *tiketID, delErr)
			}
		}
	}

	w.WriteHeader(204)
}

// ── REPLACE TIKET ─────────────────────────────────────────────────────────────

func (h *Handler) ReplaceOptionalTiket(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	oid := chi.URLParam(r, "oid")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("tiket")
	if err != nil {
		jsonErr(w, 400, "field 'tiket' required")
		return
	}
	defer file.Close()

	// Get old tiket_drive_file_id
	var oldFileID *string
	h.DB.QueryRow(ctx, `SELECT tiket_drive_file_id FROM manifest_optional_tour WHERE id = $1::uuid`, oid).Scan(&oldFileID)

	// Fetch trip info
	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx, `SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID).
		Scan(&namaTrip, &driveFolderID)
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

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "7. Data Tiket Opsional Tour")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".pdf"
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		if strings.ToLower(ext) == ".pdf" {
			mimeType = "application/pdf"
		} else {
			mimeType = detectMime(mimeType, header.Filename)
		}
	}

	newFileID, _, err := drv.UploadFile(ctx, subFolder, header.Filename, mimeType, file)
	if err != nil {
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	// Best-effort delete old file
	if oldFileID != nil {
		if delErr := drv.DeleteFile(ctx, *oldFileID); delErr != nil {
			log.Printf("[OPTIONAL-TOUR] delete old tiket %s: %v (ignored)", *oldFileID, delErr)
		}
	}

	// Update DB
	_, err = h.DB.Exec(ctx, `
		UPDATE manifest_optional_tour SET tiket_drive_file_id = $1, updated_at = NOW()
		WHERE id = $2::uuid`, newFileID, oid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Return updated record
	var item models.ManifestOptionalTour
	var pesertaNamesStr string
	var pesertaIDsStr []string
	err = h.DB.QueryRow(ctx, `
		SELECT
			mot.id::text, mot.trip_id::text,
			mot.nama_tour, mot.kategori,
			mot.tanggal::text,
			mot.harga_jual_idr, mot.harga_jual_kurs,
			mot.harga_beli_jpy, mot.harga_beli_idr, mot.kurs,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(mot.peserta_ids)),
				''
			),
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(mot.peserta_ids) p),
				'{}'::text[]
			),
			mot.tiket_drive_file_id,
			mot.created_at, mot.updated_at
		FROM manifest_optional_tour mot
		WHERE mot.id = $1::uuid`, oid).Scan(
		&item.ID, &item.TripID,
		&item.NamaTour, &item.Kategori,
		&item.Tanggal,
		&item.HargaJualIdr, &item.HargaJualKurs,
		&item.HargaBeliJpy, &item.HargaBeliIdr, &item.Kurs,
		&pesertaNamesStr,
		&pesertaIDsStr,
		&item.TiketDriveFileId,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	item.PesertaIds = pesertaIDsStr
	if pesertaNamesStr != "" {
		item.PesertaNames = strings.Split(pesertaNamesStr, ", ")
	} else {
		item.PesertaNames = []string{}
	}

	jsonOK(w, item)
}

// ── OCR TIKET ─────────────────────────────────────────────────────────────────

const optionalTourOcrPrompt = `Baca tiket tur opsional dari dokumen ini. Kembalikan HANYA JSON valid (tanpa markdown, tanpa teks lain):
{
  "nama_tour": "nama kegiatan (Disneyland/DisneySea/USJ/Tombori/Shibuya Sky/dll)",
  "tanggal": "YYYY-MM-DD",
  "harga_beli_kurs": angka_harga_dalam_mata_uang_asing,
  "kurs": angka_kurs_jika_ada_atau_0,
  "peserta_names": ["NAMA LENGKAP 1", "NAMA LENGKAP 2"]
}
ATURAN:
- Tokyo Disneyland → nama_tour: "Disneyland"
- Tokyo DisneySea → nama_tour: "Disneysea"
- Universal Studios Japan → nama_tour: "USJ"
- tanggal = tanggal masuk/admission date dalam format YYYY-MM-DD
- harga_beli_kurs = harga tiket per orang dalam mata uang asing (JPY/USD/dll)
- peserta_names = daftar nama penumpang/peserta yang ada di tiket, UPPERCASE
- Jika informasi tidak ada, gunakan string kosong "" atau 0 untuk angka
Kembalikan JSON saja.`

func (h *Handler) OcrTiketOptional(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("[OCR-OPTIONAL] received file: %s | size: %d bytes", header.Filename, header.Size)

	data, err := io.ReadAll(file)
	if err != nil {
		jsonErr(w, 500, "failed to read file")
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	log.Printf("[OCR-OPTIONAL] sending to Anthropic (%d bytes base64)...", len(b64))

	reqBody := map[string]any{
		"model":      "claude-opus-4-8",
		"max_tokens": 1024,
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
				{"type": "text", "text": optionalTourOcrPrompt},
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

	log.Printf("[OCR-OPTIONAL] anthropic response status: %d", resp.StatusCode)

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

	log.Printf("[OCR-OPTIONAL] raw result: %s", text)

	var result models.OptionalTourOCRResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		jsonErr(w, 502, "ocr parse error: "+err.Error())
		return
	}

	log.Printf("[OCR-OPTIONAL] success: tour=%s tanggal=%s harga_beli_kurs=%.0f peserta=%d",
		result.NamaTour, result.Tanggal, result.HargaBeliKurs, len(result.PesertaNames))
	jsonOK(w, result)
}

// ── CSV: shared builder ───────────────────────────────────────────────────────

func (h *Handler) buildOptionalTourCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
	ctx := r.Context()

	var namaTrip string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip)
	if err != nil {
		return nil, "", "", fmt.Errorf("trip not found: %w", err)
	}

	rows, err := h.DB.Query(ctx, `
		SELECT
			mot.nama_tour,
			mot.tanggal::text,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(mot.peserta_ids)),
				''
			) AS peserta_names,
			COALESCE(array_length(mot.peserta_ids, 1), 0) AS total_pax,
			COALESCE(mot.harga_beli_idr, 0),
			COALESCE(mot.harga_jual_idr, 0)
		FROM manifest_optional_tour mot
		WHERE mot.trip_id = $1::uuid
		ORDER BY mot.created_at DESC`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	type csvRow struct {
		NamaTour    string
		Tanggal     *string
		Peserta     string
		TotalPax    int
		HargaBeli   float64
		HargaJual   float64
	}

	var dataRows []csvRow
	for rows.Next() {
		var dr csvRow
		if err := rows.Scan(
			&dr.NamaTour, &dr.Tanggal, &dr.Peserta, &dr.TotalPax,
			&dr.HargaBeli, &dr.HargaJual,
		); err != nil {
			continue
		}
		dataRows = append(dataRows, dr)
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	// Header row
	cw.Write([]string{
		"NO", "NAMA KEGIATAN", "TANGGAL", "PESERTA",
		"HARGA BELI (Rp)", "HARGA JUAL (Rp)",
		"TOTAL PAX", "TOTAL HARGA JUAL", "TOTAL HARGA BELI", "LABA",
	})

	var grandTotalJual, grandTotalBeli float64
	for i, dr := range dataRows {
		totalJual := float64(dr.TotalPax) * dr.HargaJual
		totalBeli := float64(dr.TotalPax) * dr.HargaBeli
		laba := totalJual - totalBeli
		grandTotalJual += totalJual
		grandTotalBeli += totalBeli

		tanggalStr := ""
		if dr.Tanggal != nil {
			tanggalStr = *dr.Tanggal
		}

		cw.Write([]string{
			strconv.Itoa(i + 1),
			dr.NamaTour,
			tanggalStr,
			dr.Peserta,
			fmt.Sprintf("%.0f", dr.HargaBeli),
			fmt.Sprintf("%.0f", dr.HargaJual),
			strconv.Itoa(dr.TotalPax),
			fmt.Sprintf("%.0f", totalJual),
			fmt.Sprintf("%.0f", totalBeli),
			fmt.Sprintf("%.0f", laba),
		})
	}

	// Total row
	cw.Write([]string{
		"", "TOTAL", "", "",
		"", "",
		"", fmt.Sprintf("%.0f", grandTotalJual),
		fmt.Sprintf("%.0f", grandTotalBeli),
		fmt.Sprintf("%.0f", grandTotalJual-grandTotalBeli),
	})

	cw.Flush()

	fileName := fmt.Sprintf("manifest_optional_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportOptionalTourCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildOptionalTourCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadOptionalTourCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildOptionalTourCSV(r, tripID)
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

	optionalFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "7. Data Tiket Opsional Tour")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, optionalFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[OPTIONAL-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[OPTIONAL-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}
