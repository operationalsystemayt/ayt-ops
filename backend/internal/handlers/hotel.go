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

func (h *Handler) ListHotel(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			mh.id::text, mh.trip_id::text,
			mh.rute, mh.nama_hotel, mh.nama_agent, mh.confirmation_number,
			mh.tgl_stay_mulai::text, mh.tgl_stay_selesai::text,
			mh.jumlah_room, mh.tipe_room::text, mh.jumlah_malam,
			mh.harga_jpy, mh.harga_idr, mh.total_idr, mh.harga_jual_idr, mh.kurs,
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp
				 WHERE mp.id = ANY(mh.peserta_ids)),
				''
			) AS peserta_names,
			COALESCE(
				(SELECT array_agg(p::text) FROM unnest(mh.peserta_ids) p),
				'{}'::text[]
			) AS peserta_ids,
			mh.nota_drive_file_id,
			ps.deadline::text,
			mh.payment_schedule_id::text,
			mh.created_at, mh.updated_at
		FROM manifest_hotel mh
		LEFT JOIN payment_schedules ps ON ps.id = mh.payment_schedule_id
		WHERE mh.trip_id = $1::uuid
		ORDER BY mh.created_at`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.ManifestHotel{}
	for rows.Next() {
		var item models.ManifestHotel
		var pesertaNamesStr string
		var pesertaIDsStr []string
		if err := rows.Scan(
			&item.ID, &item.TripID,
			&item.Rute, &item.NamaHotel, &item.NamaAgent, &item.ConfirmationNumber,
			&item.TglStayMulai, &item.TglStaySelesai,
			&item.JumlahRoom, &item.TipeRoom, &item.JumlahMalam,
			&item.HargaJpy, &item.HargaIdr, &item.TotalIdr, &item.HargaJualIdr, &item.Kurs,
			&pesertaNamesStr,
			&pesertaIDsStr,
			&item.NotaDriveFileId,
			&item.WaktuPembayaran,
			&item.PaymentScheduleId,
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

func (h *Handler) CreateHotel(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		Rute               *string  `json:"rute"`
		NamaHotel          *string  `json:"nama_hotel"`
		NamaAgent          *string  `json:"nama_agent"`
		ConfirmationNumber *string  `json:"confirmation_number"`
		TglStayMulai       *string  `json:"tgl_stay_mulai"`
		TglStaySelesai     *string  `json:"tgl_stay_selesai"`
		JumlahRoom         *int     `json:"jumlah_room"`
		TipeRoom           *string  `json:"tipe_room"`
		JumlahMalam        *int     `json:"jumlah_malam"`
		HargaJpy           *float64 `json:"harga_jpy"`
		Kurs               *float64 `json:"kurs"`
		HargaIdr           *float64 `json:"harga_idr"`
		TotalIdr           *float64 `json:"total_idr"`
		HargaJualIdr       *float64 `json:"harga_jual_idr"`
		PesertaIds         []string `json:"peserta_ids"`
		NotaDriveFileId    *string  `json:"nota_drive_file_id"`
		WaktuPembayaran    *string  `json:"waktu_pembayaran"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_idr if not provided
	if body.HargaIdr == nil && body.HargaJpy != nil && body.Kurs != nil {
		v := *body.HargaJpy * *body.Kurs
		body.HargaIdr = &v
	}

	ctx := r.Context()

	// Create payment schedule if waktu_pembayaran + harga_idr set
	var paymentScheduleID *string
	if body.WaktuPembayaran != nil && *body.WaktuPembayaran != "" &&
		body.HargaIdr != nil && *body.HargaIdr > 0 {
		deskripsi := body.ConfirmationNumber
		var psID string
		err := h.DB.QueryRow(ctx, `
			INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
			VALUES ($1::uuid, 'HOTEL', $2, $3::date, $4)
			RETURNING id::text`,
			tripID, deskripsi, body.WaktuPembayaran, body.HargaIdr,
		).Scan(&psID)
		if err != nil {
			jsonErr(w, 500, "create payment_schedule: "+err.Error())
			return
		}
		paymentScheduleID = &psID
	}

	// Format peserta_ids as PostgreSQL uuid array literal
	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	var item models.ManifestHotel
	err := h.DB.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO manifest_hotel
		  (trip_id, rute, nama_hotel, nama_agent, confirmation_number,
		   tgl_stay_mulai, tgl_stay_selesai, jumlah_room, tipe_room, jumlah_malam,
		   harga_jpy, harga_idr, total_idr, harga_jual_idr, kurs,
		   peserta_ids, nota_drive_file_id, payment_schedule_id)
		VALUES
		  ($1::uuid, $2, $3, $4, $5,
		   $6::date, $7::date, $8, $9::room_type, $10,
		   $11, $12, $13, $14, $15,
		   %s, $16, $17::uuid)
		RETURNING
			id::text, trip_id::text,
			rute, nama_hotel, nama_agent, confirmation_number,
			tgl_stay_mulai::text, tgl_stay_selesai::text,
			jumlah_room, tipe_room::text, jumlah_malam,
			harga_jpy, harga_idr, total_idr, harga_jual_idr, kurs,
			nota_drive_file_id,
			payment_schedule_id::text,
			created_at, updated_at`,
		pesertaArrLiteral),
		tripID, body.Rute, body.NamaHotel, body.NamaAgent, body.ConfirmationNumber,
		body.TglStayMulai, body.TglStaySelesai, body.JumlahRoom, nilIfEmpty(body.TipeRoom), body.JumlahMalam,
		body.HargaJpy, body.HargaIdr, body.TotalIdr, body.HargaJualIdr, body.Kurs,
		body.NotaDriveFileId, paymentScheduleID,
	).Scan(
		&item.ID, &item.TripID,
		&item.Rute, &item.NamaHotel, &item.NamaAgent, &item.ConfirmationNumber,
		&item.TglStayMulai, &item.TglStaySelesai,
		&item.JumlahRoom, &item.TipeRoom, &item.JumlahMalam,
		&item.HargaJpy, &item.HargaIdr, &item.TotalIdr, &item.HargaJualIdr, &item.Kurs,
		&item.NotaDriveFileId,
		&item.PaymentScheduleId,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	item.PesertaIds = body.PesertaIds
	item.PesertaNames = []string{}
	item.WaktuPembayaran = body.WaktuPembayaran

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) UpdateHotel(w http.ResponseWriter, r *http.Request) {
	hid := chi.URLParam(r, "hid")
	tripID := chi.URLParam(r, "id")
	var body struct {
		Rute               *string  `json:"rute"`
		NamaHotel          *string  `json:"nama_hotel"`
		NamaAgent          *string  `json:"nama_agent"`
		ConfirmationNumber *string  `json:"confirmation_number"`
		TglStayMulai       *string  `json:"tgl_stay_mulai"`
		TglStaySelesai     *string  `json:"tgl_stay_selesai"`
		JumlahRoom         *int     `json:"jumlah_room"`
		TipeRoom           *string  `json:"tipe_room"`
		JumlahMalam        *int     `json:"jumlah_malam"`
		HargaJpy           *float64 `json:"harga_jpy"`
		Kurs               *float64 `json:"kurs"`
		HargaIdr           *float64 `json:"harga_idr"`
		TotalIdr           *float64 `json:"total_idr"`
		HargaJualIdr       *float64 `json:"harga_jual_idr"`
		PesertaIds         []string `json:"peserta_ids"`
		NotaDriveFileId    *string  `json:"nota_drive_file_id"`
		WaktuPembayaran    *string  `json:"waktu_pembayaran"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	// Auto-compute harga_idr if not provided
	if body.HargaIdr == nil && body.HargaJpy != nil && body.Kurs != nil {
		v := *body.HargaJpy * *body.Kurs
		body.HargaIdr = &v
	}

	ctx := r.Context()

	// Upsert payment schedule
	if body.WaktuPembayaran != nil && *body.WaktuPembayaran != "" &&
		body.HargaIdr != nil && *body.HargaIdr > 0 {
		var existingPSID *string
		h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_hotel WHERE id = $1::uuid`, hid).Scan(&existingPSID)

		deskripsi := body.ConfirmationNumber
		if existingPSID != nil {
			h.DB.Exec(ctx, `
				UPDATE payment_schedules SET deadline = $1::date, amount = $2, deskripsi = $3 WHERE id = $4::uuid`,
				body.WaktuPembayaran, body.HargaIdr, deskripsi, *existingPSID)
		} else {
			var psID string
			err := h.DB.QueryRow(ctx, `
				INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
				VALUES ($1::uuid, 'HOTEL', $2, $3::date, $4)
				RETURNING id::text`,
				tripID, deskripsi, body.WaktuPembayaran, body.HargaIdr,
			).Scan(&psID)
			if err == nil {
				h.DB.Exec(ctx, `UPDATE manifest_hotel SET payment_schedule_id = $1::uuid WHERE id = $2::uuid`, psID, hid)
			}
		}
	}

	pesertaArrLiteral := formatUUIDArray(body.PesertaIds)

	_, err := h.DB.Exec(ctx, fmt.Sprintf(`
		UPDATE manifest_hotel SET
			rute                = COALESCE($2, rute),
			nama_hotel          = COALESCE($3, nama_hotel),
			nama_agent          = COALESCE($4, nama_agent),
			confirmation_number = COALESCE($5, confirmation_number),
			tgl_stay_mulai      = COALESCE($6::date, tgl_stay_mulai),
			tgl_stay_selesai    = COALESCE($7::date, tgl_stay_selesai),
			jumlah_room         = COALESCE($8, jumlah_room),
			tipe_room           = COALESCE($9::room_type, tipe_room),
			jumlah_malam        = COALESCE($10, jumlah_malam),
			harga_jpy           = COALESCE($11, harga_jpy),
			harga_idr           = COALESCE($12, harga_idr),
			total_idr           = COALESCE($13, total_idr),
			harga_jual_idr      = COALESCE($14, harga_jual_idr),
			kurs                = COALESCE($15, kurs),
			peserta_ids         = %s,
			nota_drive_file_id  = COALESCE($16, nota_drive_file_id),
			updated_at          = $17
		WHERE id = $1::uuid`,
		pesertaArrLiteral),
		hid, body.Rute, body.NamaHotel, body.NamaAgent, body.ConfirmationNumber,
		body.TglStayMulai, body.TglStaySelesai, body.JumlahRoom, nilIfEmpty(body.TipeRoom), body.JumlahMalam,
		body.HargaJpy, body.HargaIdr, body.TotalIdr, body.HargaJualIdr, body.Kurs,
		body.NotaDriveFileId, time.Now(),
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteHotel(w http.ResponseWriter, r *http.Request) {
	hid := chi.URLParam(r, "hid")
	ctx := r.Context()

	var psID *string
	h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_hotel WHERE id = $1::uuid`, hid).Scan(&psID)

	_, err := h.DB.Exec(ctx, `DELETE FROM manifest_hotel WHERE id = $1::uuid`, hid)
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

func (h *Handler) UploadNotaHotel(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("[NOTA-HOTEL] uploading file=%s trip=%s", header.Filename, tripID)

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

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "5. Data Hotel")
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
		log.Printf("[NOTA-HOTEL] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[NOTA-HOTEL] uploaded: fileID=%s url=%s", fileID, viewURL)

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── OCR NOTA ──────────────────────────────────────────────────────────────────

const hotelOcrPrompt = `Baca dokumen PDF nota hotel ini dan kembalikan HANYA JSON valid berikut (tanpa markdown, tanpa teks lain):

{
  "nama_hotel": "nama hotel",
  "confirmation_numbers": ["nomor konfirmasi 1", "nomor konfirmasi 2"],
  "tgl_checkin": "YYYY-MM-DD",
  "tgl_checkout": "YYYY-MM-DD",
  "jumlah_room": 1,
  "tipe_room": "DOUBLE",
  "harga_jpy": 129000,
  "kurs": 108.5
}

ATURAN:
- tipe_room harus salah satu: DOUBLE, TWIN, SINGLE, TRIPLE
- confirmation_numbers adalah array semua nomor konfirmasi yang ada di dokumen
- harga_jpy adalah total harga dalam Yen Jepang
- kurs adalah nilai tukar JPY ke IDR (jika tidak ada, gunakan 0)
- Kembalikan JSON saja, tanpa penjelasan`

func (h *Handler) OcrNotaHotel(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("[OCR-HOTEL] received file: %s | size: %d bytes", header.Filename, header.Size)

	data, err := io.ReadAll(file)
	if err != nil {
		jsonErr(w, 500, "failed to read file")
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	log.Printf("[OCR-HOTEL] sending to Anthropic (%d bytes base64)...", len(b64))

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
				{"type": "text", "text": hotelOcrPrompt},
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

	log.Printf("[OCR-HOTEL] anthropic response status: %d", resp.StatusCode)

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

	log.Printf("[OCR-HOTEL] raw result: %s", text)

	var result models.HotelOCRResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		jsonErr(w, 502, "ocr parse error: "+err.Error())
		return
	}

	log.Printf("[OCR-HOTEL] success: hotel=%s confs=%d checkin=%s checkout=%s",
		result.NamaHotel, len(result.ConfirmationNumbers), result.TglCheckin, result.TglCheckout)
	jsonOK(w, result)
}

// ── CSV: shared builder ───────────────────────────────────────────────────────

type hotelCSVRow struct {
	Rute               string
	NamaHotel          string
	NamaAgent          string
	ConfirmationNumber string
	TglStayMulai       string
	TglStaySelesai     string
	JumlahRoom         int
	TipeRoom           string
	PesertaNames       string
	HargaJpy           float64
	HargaIdr           float64
	TotalIdr           float64
	Kurs               float64
	WaktuPembayaran    string
}

func (h *Handler) buildHotelCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
	ctx := r.Context()

	var namaTrip, tglBerangkat, tglPulang string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, tgl_berangkat::text, tgl_pulang::text FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &tglBerangkat, &tglPulang)
	if err != nil {
		return nil, "", "", fmt.Errorf("trip not found: %w", err)
	}

	// Total peserta from manifest inti (actual registered peserta, not trip.total_pax)
	var totalPax int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM manifest_peserta WHERE trip_id = $1::uuid`,
		tripID,
	).Scan(&totalPax)

	rows, err := h.DB.Query(ctx, `
		SELECT
			COALESCE(mh.rute,''),
			COALESCE(mh.nama_hotel,''),
			COALESCE(mh.nama_agent,''),
			COALESCE(mh.confirmation_number,''),
			COALESCE(mh.tgl_stay_mulai::text,''),
			COALESCE(mh.tgl_stay_selesai::text,''),
			COALESCE(mh.jumlah_room,0),
			COALESCE(mh.tipe_room::text,''),
			COALESCE(
				(SELECT string_agg(mp.nama_lengkap, ', ' ORDER BY mp.nama_lengkap)
				 FROM manifest_peserta mp WHERE mp.id = ANY(mh.peserta_ids)),
				''
			) AS peserta_names,
			COALESCE(mh.harga_jpy,0),
			COALESCE(mh.harga_idr,0),
			COALESCE(mh.total_idr,0),
			COALESCE(mh.kurs,0),
			COALESCE(ps.deadline::text,'')
		FROM manifest_hotel mh
		LEFT JOIN payment_schedules ps ON ps.id = mh.payment_schedule_id
		WHERE mh.trip_id = $1::uuid
		ORDER BY mh.rute, mh.nama_hotel, mh.nama_agent, mh.created_at`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	var dataRows []hotelCSVRow
	for rows.Next() {
		var dr hotelCSVRow
		if err := rows.Scan(
			&dr.Rute, &dr.NamaHotel, &dr.NamaAgent, &dr.ConfirmationNumber,
			&dr.TglStayMulai, &dr.TglStaySelesai, &dr.JumlahRoom, &dr.TipeRoom,
			&dr.PesertaNames, &dr.HargaJpy, &dr.HargaIdr, &dr.TotalIdr, &dr.Kurs,
			&dr.WaktuPembayaran,
		); err != nil {
			continue
		}
		dataRows = append(dataRows, dr)
	}

	// Compute room type counts for header
	var totalDouble, totalSingle, totalTwin int
	var totalPesertaCount int
	for _, dr := range dataRows {
		switch strings.ToUpper(dr.TipeRoom) {
		case "DOUBLE":
			totalDouble += dr.JumlahRoom
		case "SINGLE":
			totalSingle += dr.JumlahRoom
		case "TWIN":
			totalTwin += dr.JumlahRoom
		}
		// count peserta names (comma-separated)
		if dr.PesertaNames != "" {
			totalPesertaCount += len(strings.Split(dr.PesertaNames, ","))
		}
	}

	// Compute hotel-level totals: sum of harga_idr per hotel
	type hotelKey struct{ Rute, NamaHotel string }
	hotelTotals := map[hotelKey]float64{}
	for _, dr := range dataRows {
		k := hotelKey{dr.Rute, dr.NamaHotel}
		hotelTotals[k] += dr.HargaIdr
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	numCols := 12
	emptyRow := make([]string, numCols)

	writeHotelRow := func(val string) {
		row := make([]string, numCols)
		row[0] = val
		cw.Write(row)
	}

	// ── Header block ─────────────────────────────────────────────────────────
	destinasi := ""
	if len(dataRows) > 0 {
		var cities []string
		seen := map[string]bool{}
		for _, dr := range dataRows {
			if dr.Rute != "" && !seen[dr.Rute] {
				seen[dr.Rute] = true
				cities = append(cities, strings.ToUpper(dr.Rute))
			}
		}
		destinasi = strings.Join(cities, " - ")
	}

	writeHotelRow("DATA PEMESANAN HOTEL " + strings.ToUpper(namaTrip))
	writeHotelRow(tripDateRange(tglBerangkat, tglPulang))
	writeHotelRow(destinasi)
	cw.Write(emptyRow)

	// Summary row
	headerPeserta := make([]string, numCols)
	headerPeserta[1] = "JUMLAH PESERTA :"
	if totalPax > 0 {
		headerPeserta[2] = fmt.Sprintf("%d", totalPax)
	}
	cw.Write(headerPeserta)

	headerDouble := make([]string, numCols)
	headerDouble[1] = "JUMLAH DOUBLE ROOM :"
	if totalDouble > 0 {
		headerDouble[2] = fmt.Sprintf("%d", totalDouble)
	}
	cw.Write(headerDouble)

	headerSingle := make([]string, numCols)
	headerSingle[1] = "JUMLAH SINGLE ROOM :"
	if totalSingle > 0 {
		headerSingle[2] = fmt.Sprintf("%d", totalSingle)
	}
	cw.Write(headerSingle)

	headerTwin := make([]string, numCols)
	headerTwin[1] = "JUMLAH TWIN ROOM :"
	if totalTwin > 0 {
		headerTwin[2] = fmt.Sprintf("%d", totalTwin)
	}
	cw.Write(headerTwin)

	cw.Write(emptyRow)

	// ── Column headers ────────────────────────────────────────────────────────
	cw.Write([]string{
		"RUTE", "NAMA HOTEL", "NAMA AGENT", "CONFIRMATION NUMBER",
		"TGL STAY", "JML ROOM & MALAM", "NAMA TAMU",
		"JPY", "RUPIAH", "JUMLAH", "WAKTU PEMBAYARAN", "KURS",
	})

	// ── Data rows ─────────────────────────────────────────────────────────────
	prevRute := ""
	prevNamaHotel := ""
	prevNamaAgent := ""
	prevKurs := 0.0
	hotelFirstRow := map[hotelKey]bool{}
	var grandTotal float64

	for _, dr := range dataRows {
		hk := hotelKey{dr.Rute, dr.NamaHotel}

		// JUMLAH shown only on first row of each hotel
		jumlahStr := ""
		if !hotelFirstRow[hk] {
			hotelFirstRow[hk] = true
			total := hotelTotals[hk]
			grandTotal += total
			jumlahStr = fmt.Sprintf(" Rp %s ", formatIDR(total))
		}

		// Deduplication
		ruteStr := ""
		if dr.Rute != prevRute {
			ruteStr = dr.Rute
			prevRute = dr.Rute
		}
		namaHotelStr := ""
		if dr.NamaHotel != prevNamaHotel {
			namaHotelStr = dr.NamaHotel
			prevNamaHotel = dr.NamaHotel
		}
		namaAgentStr := ""
		if dr.NamaAgent != prevNamaAgent {
			namaAgentStr = dr.NamaAgent
			prevNamaAgent = dr.NamaAgent
		}
		kursStr := ""
		if dr.Kurs != 0 && dr.Kurs != prevKurs {
			kursStr = formatKurs(dr.Kurs)
			prevKurs = dr.Kurs
		}

		// TGL STAY
		tglStay := ""
		if dr.TglStayMulai != "" && dr.TglStaySelesai != "" {
			tglStay = fmtDateStay(dr.TglStayMulai, dr.TglStaySelesai)
		}

		// JML ROOM & MALAM
		jmlRoomMalam := ""
		if dr.JumlahRoom > 0 && dr.TipeRoom != "" {
			malam := ""
			if dr.TglStayMulai != "" && dr.TglStaySelesai != "" {
				days := countNights(dr.TglStayMulai, dr.TglStaySelesai)
				if days > 0 {
					malam = fmt.Sprintf("%d ROOM - %s", dr.JumlahRoom, strings.ToUpper(dr.TipeRoom))
				} else {
					malam = fmt.Sprintf("%d ROOM - %s", dr.JumlahRoom, strings.ToUpper(dr.TipeRoom))
				}
			} else {
				malam = fmt.Sprintf("%d ROOM - %s", dr.JumlahRoom, strings.ToUpper(dr.TipeRoom))
			}
			jmlRoomMalam = malam
		}

		// Harga JPY
		jpyStr := ""
		if dr.HargaJpy > 0 {
			jpyStr = fmt.Sprintf("¥%s", formatIDR(dr.HargaJpy))
		}

		// Harga IDR
		idrStr := ""
		if dr.HargaIdr > 0 {
			idrStr = fmt.Sprintf("Rp%s", formatIDR(dr.HargaIdr))
		}

		// Peserta names in quotes like CSV sample
		pesertaStr := ""
		if dr.PesertaNames != "" {
			pesertaStr = fmt.Sprintf(`"%s"`, dr.PesertaNames)
		}

		cw.Write([]string{
			ruteStr, namaHotelStr, namaAgentStr, dr.ConfirmationNumber,
			tglStay, jmlRoomMalam, pesertaStr,
			jpyStr, idrStr, jumlahStr, dr.WaktuPembayaran, kursStr,
		})
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	totalRow := make([]string, numCols)
	totalRow[6] = "TOTAL KESELURUHAN"
	totalRow[9] = fmt.Sprintf(" Rp %s ", formatIDR(grandTotal))
	cw.Write(totalRow)

	avgRow := make([]string, numCols)
	avgRow[6] = "HARGA RATA-RATA PERPAX 6 MALAM"
	if totalPax > 0 {
		avgRow[9] = fmt.Sprintf(" Rp %s ", formatIDR(grandTotal/float64(totalPax)))
	}
	cw.Write(avgRow)

	cw.Flush()

	fileName := fmt.Sprintf("manifest_hotel_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportHotelCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildHotelCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadHotelCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildHotelCSV(r, tripID)
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

	hotelFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "5. Data Hotel")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, hotelFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[HOTEL-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[HOTEL-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

// formatUUIDArray converts []string of UUIDs to PostgreSQL uuid[] literal.
// Returns 'ARRAY[]::uuid[]' for empty, or 'ARRAY[''uuid1'',''uuid2'']::uuid[]' otherwise.
func formatUUIDArray(ids []string) string {
	if len(ids) == 0 {
		return "ARRAY[]::uuid[]"
	}
	quoted := make([]string, len(ids))
	for i, id := range ids {
		quoted[i] = fmt.Sprintf("'%s'", strings.ReplaceAll(id, "'", ""))
	}
	return fmt.Sprintf("ARRAY[%s]::uuid[]", strings.Join(quoted, ","))
}

// fmtDateStay formats "2026-01-29" + "2026-02-01" → "29 JAN - 1 FEB"
func fmtDateStay(start, end string) string {
	s, err1 := time.Parse("2006-01-02", start)
	e, err2 := time.Parse("2006-01-02", end)
	if err1 != nil || err2 != nil {
		return start + " - " + end
	}
	if s.Month() == e.Month() {
		return fmt.Sprintf("%d - %d %s", s.Day(), e.Day(), strings.ToUpper(s.Format("Jan")))
	}
	return fmt.Sprintf("%d %s - %d %s", s.Day(), strings.ToUpper(s.Format("Jan")),
		e.Day(), strings.ToUpper(e.Format("Jan")))
}

// countNights returns the number of nights between two date strings.
func countNights(start, end string) int {
	s, err1 := time.Parse("2006-01-02", start)
	e, err2 := time.Parse("2006-01-02", end)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(e.Sub(s).Hours() / 24)
}

// formatKurs formats a kurs float as a clean number string.
func formatKurs(k float64) string {
	if k == float64(int64(k)) {
		return fmt.Sprintf("%.0f", k)
	}
	return fmt.Sprintf("%g", k)
}

// detectMime is defined in keberangkatan.go — re-used here. No duplicate needed.
