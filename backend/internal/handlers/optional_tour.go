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

func (h *Handler) ListOptionalTour(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			mot.id::text, mot.trip_id::text,
			mot.nama_tour, mot.kategori, mot.tier,
			mot.harga_jual_idr, mot.harga_beli_jpy, mot.harga_beli_idr, mot.kurs,
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
		ORDER BY mot.nama_tour, mot.tier, mot.created_at`, tripID)
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
			&item.NamaTour, &item.Kategori, &item.Tier,
			&item.HargaJualIdr, &item.HargaBeliJpy, &item.HargaBeliIdr, &item.Kurs,
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
	var body struct {
		NamaTour         string   `json:"nama_tour"`
		Kategori         *string  `json:"kategori"`
		Tier             *string  `json:"tier"`
		HargaJualIdr     *float64 `json:"harga_jual_idr"`
		HargaBeliJpy     *float64 `json:"harga_beli_jpy"`
		HargaBeliIdr     *float64 `json:"harga_beli_idr"`
		Kurs             *float64 `json:"kurs"`
		PesertaIds       []string `json:"peserta_ids"`
		TiketDriveFileId *string  `json:"tiket_drive_file_id"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_beli_idr if not set
	if body.HargaBeliIdr == nil && body.HargaBeliJpy != nil && body.Kurs != nil {
		v := *body.HargaBeliJpy * *body.Kurs
		body.HargaBeliIdr = &v
	}

	// Default kategori = nama_tour
	if body.Kategori == nil || *body.Kategori == "" {
		k := body.NamaTour
		body.Kategori = &k
	}

	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	var item models.ManifestOptionalTour
	err := h.DB.QueryRow(r.Context(), fmt.Sprintf(`
		INSERT INTO manifest_optional_tour
		  (trip_id, nama_tour, kategori, tier,
		   harga_jual_idr, harga_beli_jpy, harga_beli_idr, kurs,
		   peserta_ids, tiket_drive_file_id)
		VALUES
		  ($1::uuid, $2, $3, $4,
		   $5, $6, $7, $8,
		   %s, $9)
		RETURNING
			id::text, trip_id::text,
			nama_tour, kategori, tier,
			harga_jual_idr, harga_beli_jpy, harga_beli_idr, kurs,
			tiket_drive_file_id,
			created_at, updated_at`,
		pesertaArrLiteral),
		tripID, body.NamaTour, body.Kategori, body.Tier,
		body.HargaJualIdr, body.HargaBeliJpy, body.HargaBeliIdr, body.Kurs,
		body.TiketDriveFileId,
	).Scan(
		&item.ID, &item.TripID,
		&item.NamaTour, &item.Kategori, &item.Tier,
		&item.HargaJualIdr, &item.HargaBeliJpy, &item.HargaBeliIdr, &item.Kurs,
		&item.TiketDriveFileId,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	item.PesertaIds = body.PesertaIds
	item.PesertaNames = []string{}

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) UpdateOptionalTour(w http.ResponseWriter, r *http.Request) {
	oid := chi.URLParam(r, "oid")
	var body struct {
		NamaTour         *string  `json:"nama_tour"`
		Kategori         *string  `json:"kategori"`
		Tier             *string  `json:"tier"`
		HargaJualIdr     *float64 `json:"harga_jual_idr"`
		HargaBeliJpy     *float64 `json:"harga_beli_jpy"`
		HargaBeliIdr     *float64 `json:"harga_beli_idr"`
		Kurs             *float64 `json:"kurs"`
		PesertaIds       []string `json:"peserta_ids"`
		TiketDriveFileId *string  `json:"tiket_drive_file_id"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_beli_idr if not set
	if body.HargaBeliIdr == nil && body.HargaBeliJpy != nil && body.Kurs != nil {
		v := *body.HargaBeliJpy * *body.Kurs
		body.HargaBeliIdr = &v
	}

	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	_, err := h.DB.Exec(r.Context(), fmt.Sprintf(`
		UPDATE manifest_optional_tour SET
			nama_tour         = COALESCE($2, nama_tour),
			kategori          = COALESCE($3, kategori),
			tier              = COALESCE($4, tier),
			harga_jual_idr    = COALESCE($5, harga_jual_idr),
			harga_beli_jpy    = COALESCE($6, harga_beli_jpy),
			harga_beli_idr    = COALESCE($7, harga_beli_idr),
			kurs              = COALESCE($8, kurs),
			peserta_ids       = %s,
			tiket_drive_file_id = COALESCE($9, tiket_drive_file_id),
			updated_at        = $10
		WHERE id = $1::uuid`,
		pesertaArrLiteral),
		oid, body.NamaTour, body.Kategori, body.Tier,
		body.HargaJualIdr, body.HargaBeliJpy, body.HargaBeliIdr, body.Kurs,
		body.TiketDriveFileId, time.Now(),
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
	_, err := h.DB.Exec(r.Context(), `DELETE FROM manifest_optional_tour WHERE id = $1::uuid`, oid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── UPLOAD TIKET ──────────────────────────────────────────────────────────────

func (h *Handler) UploadTiketOptional(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("[TIKET-OPTIONAL] uploading file=%s trip=%s", header.Filename, tripID)

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	if driveFolderID == nil {
		folderID, err := drv.EnsureFolder(ctx, drv.RootFolderID, namaTrip)
		if err != nil {
			jsonErr(w, 500, "create trip folder: "+err.Error())
			return
		}
		driveFolderID = &folderID
		h.DB.Exec(ctx, `UPDATE trips SET drive_folder_id = $1 WHERE id = $2::uuid`, folderID, tripID)
	}

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "7. Data Tiket Opsional Tour")
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
		log.Printf("[TIKET-OPTIONAL] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[TIKET-OPTIONAL] uploaded: fileID=%s url=%s", fileID, viewURL)

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── OCR TIKET ─────────────────────────────────────────────────────────────────

const optionalTourOcrPrompt = `Baca tiket tur opsional dari PDF ini. Kembalikan HANYA JSON (tanpa markdown):
{
  "nama_tour": "nama wahana/park (Disneyland/DisneySea/USJ/Tombori/dll)",
  "tier": "Adult/Junior/Child/Senior/+65/-65",
  "harga_beli_jpy": angka_harga_jpy,
  "admission_date": "YYYY-MM-DD",
  "qty": jumlah_tiket_di_dokumen_ini
}
Untuk Tokyo Disneyland → nama_tour: "Disneyland"
Untuk Tokyo DisneySea → nama_tour: "Disneysea"
Adult/大人 → tier: "Adult", Junior/中人 → tier: "Junior", Child/小人 → tier: "Child"
Hitung qty dari jumlah tiket yang ada di dokumen ini.
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

	log.Printf("[OCR-OPTIONAL] success: tour=%s tier=%s jpy=%.0f date=%s qty=%d",
		result.NamaTour, result.Tier, result.HargaBeliJpy, result.AdmissionDate, result.Qty)
	jsonOK(w, result)
}

// ── CSV: shared builder ───────────────────────────────────────────────────────

type optionalTourCSVRow struct {
	NamaTour     string
	Tier         string
	HargaJualIdr float64
	HargaBeliJpy float64
	HargaBeliIdr float64
	Kurs         float64
	PesertaCount int
	PesertaNames string
}

func (h *Handler) buildOptionalTourCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
	ctx := r.Context()

	var namaTrip, tglBerangkat, tglPulang string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, tgl_berangkat::text, tgl_pulang::text FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &tglBerangkat, &tglPulang)
	if err != nil {
		return nil, "", "", fmt.Errorf("trip not found: %w", err)
	}

	// Fetch all peserta for manifest
	type pesertaRow struct {
		ID          string
		NoUrut      int
		Title       string
		NamaLengkap string
		Age         int
		Kategori    string
	}
	pesertaRows, err := h.DB.Query(ctx, `
		SELECT id::text, no_urut, COALESCE(title::text,''), nama_lengkap,
			COALESCE(EXTRACT(YEAR FROM AGE(NOW(), tgl_lahir))::int, 0),
			COALESCE(
				CASE
					WHEN EXTRACT(YEAR FROM AGE(NOW(), tgl_lahir)) >= 17 THEN 'Dewasa 17 th'
					WHEN EXTRACT(YEAR FROM AGE(NOW(), tgl_lahir)) >= 12 THEN 'Junior 12-16 th'
					ELSE 'Anak < 12 th'
				END,
				'Dewasa 17 th'
			)
		FROM manifest_peserta WHERE trip_id = $1::uuid ORDER BY no_urut`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer pesertaRows.Close()
	var peserta []pesertaRow
	for pesertaRows.Next() {
		var p pesertaRow
		if err := pesertaRows.Scan(&p.ID, &p.NoUrut, &p.Title, &p.NamaLengkap, &p.Age, &p.Kategori); err != nil {
			continue
		}
		peserta = append(peserta, p)
	}

	// Fetch all optional tours
	tourRows, err := h.DB.Query(ctx, `
		SELECT
			mot.id::text,
			mot.nama_tour,
			COALESCE(mot.tier,''),
			COALESCE(mot.harga_jual_idr,0),
			COALESCE(mot.harga_beli_jpy,0),
			COALESCE(mot.harga_beli_idr,0),
			COALESCE(mot.kurs,0),
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(mot.peserta_ids) p),
				'{}'::text[]
			) AS peserta_ids
		FROM manifest_optional_tour mot
		WHERE mot.trip_id = $1::uuid
		ORDER BY mot.nama_tour, mot.tier`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer tourRows.Close()

	type tourEntry struct {
		ID           string
		NamaTour     string
		Tier         string
		HargaJualIdr float64
		HargaBeliJpy float64
		HargaBeliIdr float64
		Kurs         float64
		PesertaIDs   map[string]bool
	}
	var tours []tourEntry
	for tourRows.Next() {
		var te tourEntry
		var pesertaIDsStr []string
		if err := tourRows.Scan(
			&te.ID, &te.NamaTour, &te.Tier,
			&te.HargaJualIdr, &te.HargaBeliJpy, &te.HargaBeliIdr, &te.Kurs,
			&pesertaIDsStr,
		); err != nil {
			continue
		}
		te.PesertaIDs = map[string]bool{}
		for _, pid := range pesertaIDsStr {
			te.PesertaIDs[pid] = true
		}
		tours = append(tours, te)
	}

	// Get unique tour names (columns)
	tourNames := []string{}
	seenTour := map[string]bool{}
	for _, t := range tours {
		key := t.NamaTour
		if !seenTour[key] {
			seenTour[key] = true
			tourNames = append(tourNames, key)
		}
	}

	// Build CSV
	// 23-column format matching the sample CSV structure
	numCols := 23
	emptyRow := make([]string, numCols)

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	// ── Row 1: Company name ───────────────────────────────────────────────────
	row1 := make([]string, numCols)
	row1[0] = "ANGKASA YUDISTIRA TRAVEL"
	cw.Write(row1)

	// ── Row 2: Trip name ──────────────────────────────────────────────────────
	row2 := make([]string, numCols)
	row2[0] = "JAPAN " + strings.ToUpper(namaTrip) + " ROOMLIST/MANIFEST"
	cw.Write(row2)

	// ── Row 3: Date range + panel headers ─────────────────────────────────────
	row3 := make([]string, numCols)
	row3[0] = tripDateRange(tglBerangkat, tglPulang)
	row3[14] = "MASTER HARGA JUAL"
	row3[18] = "REKAP"
	cw.Write(row3)

	// ── Row 4: Column headers ─────────────────────────────────────────────────
	// Base cols: NO(0), Title(1), NAME(2), AGE(3), CATHEGORY(4)
	// Then one col per tour (5..5+len(tourNames)-1)
	// Then: VISA WEB, VISA WAIVER, ASURANSI (skipped, just blanks)
	// Then MASTER HARGA JUAL: Optional Tour(14), Harga (JPY)(15), Harga (Rp)(16), blank(17)
	// Then REKAP: Optional Tour(18), Total Pax(19), Harga / Pax (Rp)(20), Total (Rp)(21), blank(22)

	colHeaders := make([]string, numCols)
	colHeaders[0] = "NO "
	colHeaders[1] = "Title"
	colHeaders[2] = "NAME"
	colHeaders[3] = "AGE"
	colHeaders[4] = "CATHEGORY"
	// Tour columns (dynamic, up to 8)
	for i, tn := range tourNames {
		if 5+i < 14 {
			colHeaders[5+i] = tn
		}
	}
	colHeaders[14] = "Optional Tour"
	colHeaders[15] = "Harga (JPY)"
	colHeaders[16] = "Harga (Rp)"
	colHeaders[17] = ""
	colHeaders[18] = "Optional Tour"
	colHeaders[19] = "Total Pax"
	colHeaders[20] = "Harga / Pax (Rp)"
	colHeaders[21] = "Total (Rp)"
	colHeaders[22] = ""
	cw.Write(colHeaders)

	// ── REKAP rows (right panel) alongside data rows ──────────────────────────
	// Build rekap data first: one row per unique tour (sell side)
	type rekapEntry struct {
		NamaTour    string
		HargaJpy    float64
		HargaIdr    float64
		TotalPax    int
		TotalIdr    float64
	}
	// group tours by nama_tour for rekap
	rekapMap := map[string]*rekapEntry{}
	for _, t := range tours {
		e, ok := rekapMap[t.NamaTour]
		if !ok {
			e = &rekapEntry{NamaTour: t.NamaTour, HargaJpy: t.HargaBeliJpy, HargaIdr: t.HargaJualIdr}
			rekapMap[t.NamaTour] = e
		}
		e.TotalPax += len(t.PesertaIDs)
	}
	for k, e := range rekapMap {
		e.TotalIdr = e.HargaIdr * float64(e.TotalPax)
		rekapMap[k] = e
	}

	// Build rekap jual list
	var rekapJualList []rekapEntry
	for _, tn := range tourNames {
		if e, ok := rekapMap[tn]; ok {
			rekapJualList = append(rekapJualList, *e)
		}
	}

	// ── Data rows: one per peserta ────────────────────────────────────────────
	// First tour entry's peserta map per tour name
	tourByName := map[string][]tourEntry{}
	for _, t := range tours {
		tourByName[t.NamaTour] = append(tourByName[t.NamaTour], t)
	}

	// Count totals per tour
	tourTotalPax := map[string]int{}
	for _, t := range tours {
		tourTotalPax[t.NamaTour] += len(t.PesertaIDs)
	}

	for rowIdx, p := range peserta {
		dataRow := make([]string, numCols)
		dataRow[0] = fmt.Sprintf("%d", p.NoUrut)
		dataRow[1] = p.Title
		dataRow[2] = p.NamaLengkap
		dataRow[3] = fmt.Sprintf("%d", p.Age)
		dataRow[4] = p.Kategori

		// Tour membership columns
		for i, tn := range tourNames {
			if 5+i >= 14 {
				break
			}
			inTour := false
			for _, t := range tourByName[tn] {
				if t.PesertaIDs[p.ID] {
					inTour = true
					break
				}
			}
			if inTour {
				dataRow[5+i] = "TRUE"
			}
		}

		// REKAP columns (fill one per row until exhausted)
		if rowIdx < len(rekapJualList) {
			re := rekapJualList[rowIdx]
			dataRow[14] = re.NamaTour
			dataRow[15] = fmt.Sprintf("%.0f", re.HargaJpy)
			dataRow[16] = fmt.Sprintf("%.0f", re.HargaIdr)
			dataRow[18] = re.NamaTour
			dataRow[19] = fmt.Sprintf("%d", re.TotalPax)
			dataRow[20] = fmt.Sprintf("%.0f", re.HargaIdr)
			dataRow[21] = fmt.Sprintf("%.0f", re.TotalIdr)
		}

		cw.Write(dataRow)
	}

	// Remaining rekap rows (if more tours than peserta)
	for ri := len(peserta); ri < len(rekapJualList); ri++ {
		reRow := make([]string, numCols)
		re := rekapJualList[ri]
		reRow[14] = re.NamaTour
		reRow[15] = fmt.Sprintf("%.0f", re.HargaJpy)
		reRow[16] = fmt.Sprintf("%.0f", re.HargaIdr)
		reRow[18] = re.NamaTour
		reRow[19] = fmt.Sprintf("%d", re.TotalPax)
		reRow[20] = fmt.Sprintf("%.0f", re.HargaIdr)
		reRow[21] = fmt.Sprintf("%.0f", re.TotalIdr)
		cw.Write(reRow)
	}

	// ── TOTAL row ─────────────────────────────────────────────────────────────
	totalRow := make([]string, numCols)
	totalRow[0] = "TOTAL"
	for i, tn := range tourNames {
		if 5+i >= 14 {
			break
		}
		count := 0
		for _, t := range tourByName[tn] {
			count += len(t.PesertaIDs)
		}
		totalRow[5+i] = fmt.Sprintf("%d", count)
	}
	totalRow[14] = "MASTER HARGA BELI"
	cw.Write(totalRow)

	// ── MASTER HARGA BELI section ─────────────────────────────────────────────
	// Header row for beli
	beliHdrRow := make([]string, numCols)
	beliHdrRow[14] = "Optional Tour"
	beliHdrRow[15] = "Harga (JPY)"
	beliHdrRow[16] = "Harga (Rp)"
	beliHdrRow[18] = "Optional Tour"
	beliHdrRow[19] = "Total Pax"
	beliHdrRow[20] = "Harga / Pax (Rp)"
	beliHdrRow[21] = "Total (Rp)"
	beliHdrRow[22] = "Grand Total (Rp)"
	cw.Write(beliHdrRow)

	// Build beli rekap
	type beliEntry struct {
		NamaTour    string
		HargaJpy    float64
		HargaIdr    float64
		TotalPax    int
		TotalIdr    float64
		GrandTotal  float64
	}
	var beliList []beliEntry
	var grandTotalBeli float64
	for _, tn := range tourNames {
		var hargaJpy, hargaIdr float64
		var totalPax int
		for _, t := range tourByName[tn] {
			if t.HargaBeliJpy > hargaJpy {
				hargaJpy = t.HargaBeliJpy
			}
			if t.HargaBeliIdr > hargaIdr {
				hargaIdr = t.HargaBeliIdr
			}
			totalPax += len(t.PesertaIDs)
		}
		totalIdr := hargaIdr * float64(totalPax)
		grandTotalBeli += totalIdr
		beliList = append(beliList, beliEntry{
			NamaTour: tn, HargaJpy: hargaJpy, HargaIdr: hargaIdr,
			TotalPax: totalPax, TotalIdr: totalIdr,
		})
	}

	// Grand total jual
	var grandTotalJual float64
	for _, re := range rekapJualList {
		grandTotalJual += re.TotalIdr
	}

	for bi, be := range beliList {
		beliRow := make([]string, numCols)
		beliRow[14] = be.NamaTour
		beliRow[15] = fmt.Sprintf("%.0f", be.HargaJpy)
		beliRow[16] = fmt.Sprintf("%.0f", be.HargaIdr)
		beliRow[18] = be.NamaTour
		beliRow[19] = fmt.Sprintf("%d", be.TotalPax)
		beliRow[20] = fmt.Sprintf("%.0f", be.HargaIdr)
		beliRow[21] = fmt.Sprintf("%.0f", be.TotalIdr)
		if bi == 0 {
			beliRow[22] = fmt.Sprintf("%.0f", grandTotalBeli)
		}
		cw.Write(beliRow)
	}

	// ── TOTAL OPTIONAL TOUR row ───────────────────────────────────────────────
	cw.Write(emptyRow)

	totalOptRow := make([]string, numCols)
	totalOptRow[18] = "TOTAL OPTIONAL TOUR"
	totalOptRow[21] = fmt.Sprintf("%.0f", grandTotalJual)
	totalOptRow[22] = fmt.Sprintf("Rp%.0f", grandTotalJual)
	cw.Write(totalOptRow)

	// ── LABA row ──────────────────────────────────────────────────────────────
	laba := grandTotalJual - grandTotalBeli
	labaRow := make([]string, numCols)
	labaRow[14] = "LABA OPTIONAL TOUR & VISA"
	labaRow[22] = fmt.Sprintf("Rp%.0f", laba)
	cw.Write(labaRow)

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

	data, namaTrip, fileName, err := h.buildOptionalTourCSV(r, tripID)
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

	if driveFolderID == nil {
		folderID, err := drv.EnsureFolder(ctx, drv.RootFolderID, namaTrip)
		if err != nil {
			jsonErr(w, 500, "create trip folder: "+err.Error())
			return
		}
		driveFolderID = &folderID
		h.DB.Exec(ctx, `UPDATE trips SET drive_folder_id = $1 WHERE id = $2::uuid`, folderID, tripID)
	}

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
