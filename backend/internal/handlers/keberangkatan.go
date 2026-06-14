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

func (h *Handler) ListKeberangkatan(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT
			mk.id::text, mk.trip_id::text, mk.peserta_id::text, mk.payment_schedule_id::text,
			mk.tgl_pemesanan::text, mk.pemesanan, mk.agent,
			mk.harga_tiket, mk.kode_booking, mk.no_etiket, mk.maskapai,
			mk.rute_berangkat, mk.tgl_berangkat_flight::text, mk.jam_berangkat::text,
			mk.rute_pulang, mk.tgl_pulang_flight::text, mk.jam_pulang::text,
			mk.bagasi_kabin_kg, mk.bagasi_checkin_kg,
			mk.unit, mk.klien, mk.tiket_drive_file_id,
			ps.deadline::text,
			mp.title::text, mp.nama_lengkap, mp.no_paspor,
			mp.place_of_birth, mp.tgl_lahir::text, mp.place_of_issued,
			mp.issued_date::text, mp.expiry_date::text,
			mk.terminal, mk.transit_berangkat, mk.transit_pulang,
			mk.bagasi_checkin_berangkat_kg, mk.bagasi_checkin_pulang_kg,
			mk.harga_tiket_berangkat, mk.harga_tiket_pulang,
			mk.created_at, mk.updated_at
		FROM manifest_keberangkatan mk
		LEFT JOIN payment_schedules ps ON ps.id = mk.payment_schedule_id
		LEFT JOIN manifest_peserta mp ON mp.id = mk.peserta_id
		WHERE mk.trip_id = $1::uuid
		ORDER BY mk.created_at`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.ManifestKeberangkatan{}
	for rows.Next() {
		var k models.ManifestKeberangkatan
		if err := rows.Scan(
			&k.ID, &k.TripID, &k.PesertaID, &k.PaymentScheduleID,
			&k.TglPemesanan, &k.Pemesanan, &k.Agent,
			&k.HargaTiket, &k.KodeBooking, &k.NoEtiket, &k.Maskapai,
			&k.RuteBerangkat, &k.TglBerangkatFlight, &k.JamBerangkat,
			&k.RutePulang, &k.TglPulangFlight, &k.JamPulang,
			&k.BagasiKabinKg, &k.BagasiCheckinKg,
			&k.Unit, &k.Klien, &k.TiketDriveFileID,
			&k.LimitPembayaran,
			&k.Title, &k.NamaLengkap, &k.NoPaspor,
			&k.PlaceOfBirth, &k.TglLahir, &k.PlaceOfIssued,
			&k.IssuedDate, &k.ExpiryDate,
			&k.Terminal, &k.TransitBerangkat, &k.TransitPulang,
			&k.BagasiCheckinBerangkatKg, &k.BagasiCheckinPulangKg,
			&k.HargaTiketBerangkat, &k.HargaTiketPulang,
			&k.CreatedAt, &k.UpdatedAt,
		); err != nil {
			jsonErr(w, 500, err.Error())
			return
		}
		list = append(list, k)
	}
	jsonOK(w, list)
}

// ── CREATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) CreateKeberangkatan(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		PesertaID          *string  `json:"peserta_id"`
		TglPemesanan       *string  `json:"tgl_pemesanan"`
		Pemesanan          *string  `json:"pemesanan"`
		Agent              *string  `json:"agent"`
		LimitPembayaran    *string  `json:"limit_pembayaran"`
		HargaTiket         *float64 `json:"harga_tiket"`
		KodeBooking        *string  `json:"kode_booking"`
		NoEtiket           *string  `json:"no_etiket"`
		Maskapai           *string  `json:"maskapai"`
		RuteBerangkat      *string  `json:"rute_berangkat"`
		TglBerangkatFlight *string  `json:"tgl_berangkat_flight"`
		JamBerangkat       *string  `json:"jam_berangkat"`
		RutePulang         *string  `json:"rute_pulang"`
		TglPulangFlight    *string  `json:"tgl_pulang_flight"`
		JamPulang          *string  `json:"jam_pulang"`
		BagasiKabinKg      *float64 `json:"bagasi_kabin_kg"`
		BagasiCheckinKg    *float64 `json:"bagasi_checkin_kg"`
		Unit               *int     `json:"unit"`
		Klien              *string  `json:"klien"`
		Terminal                 *string  `json:"terminal"`
		TransitBerangkat         *string  `json:"transit_berangkat"`
		TransitPulang            *string  `json:"transit_pulang"`
		BagasiCheckinBerangkatKg *float64 `json:"bagasi_checkin_berangkat_kg"`
		BagasiCheckinPulangKg    *float64 `json:"bagasi_checkin_pulang_kg"`
		HargaTiketBerangkat      *float64 `json:"harga_tiket_berangkat"`
		HargaTiketPulang         *float64 `json:"harga_tiket_pulang"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	ctx := r.Context()

	// harga_tiket = harga_tiket_berangkat + harga_tiket_pulang (kept for laba/CSV compatibility)
	var hargaTiket *float64
	if body.HargaTiketBerangkat != nil || body.HargaTiketPulang != nil {
		total := 0.0
		if body.HargaTiketBerangkat != nil {
			total += *body.HargaTiketBerangkat
		}
		if body.HargaTiketPulang != nil {
			total += *body.HargaTiketPulang
		}
		hargaTiket = &total
	}

	// Create payment schedule if limit + harga set
	var paymentScheduleID *string
	if body.LimitPembayaran != nil && *body.LimitPembayaran != "" &&
		hargaTiket != nil && *hargaTiket > 0 {
		deskripsi := body.KodeBooking
		var psID string
		err := h.DB.QueryRow(ctx, `
			INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
			VALUES ($1::uuid, 'TIKET', $2, $3::date, $4)
			RETURNING id::text`,
			tripID, deskripsi, body.LimitPembayaran, hargaTiket,
		).Scan(&psID)
		if err != nil {
			jsonErr(w, 500, "create payment_schedule: "+err.Error())
			return
		}
		paymentScheduleID = &psID
	}

	var k models.ManifestKeberangkatan
	err := h.DB.QueryRow(ctx, `
		INSERT INTO manifest_keberangkatan
		  (trip_id, peserta_id, tgl_pemesanan, pemesanan, agent, harga_tiket,
		   kode_booking, no_etiket, maskapai, rute_berangkat,
		   tgl_berangkat_flight, jam_berangkat, rute_pulang, tgl_pulang_flight,
		   jam_pulang, bagasi_kabin_kg, bagasi_checkin_kg, unit, klien, payment_schedule_id,
		   terminal, transit_berangkat, transit_pulang,
		   bagasi_checkin_berangkat_kg, bagasi_checkin_pulang_kg,
		   harga_tiket_berangkat, harga_tiket_pulang)
		VALUES
		  ($1::uuid, $2::uuid, $3::date, $4, $5, $6,
		   $7, $8, $9, $10,
		   $11::date, $12::time, $13, $14::date,
		   $15::time, $16, $17, $18, $19, $20::uuid,
		   $21, $22, $23,
		   $24, $25,
		   $26, $27)
		RETURNING id::text, trip_id::text, peserta_id::text, payment_schedule_id::text,
		          tgl_pemesanan::text, pemesanan, agent,
		          harga_tiket, kode_booking, no_etiket, maskapai,
		          rute_berangkat, tgl_berangkat_flight::text, jam_berangkat::text,
		          rute_pulang, tgl_pulang_flight::text, jam_pulang::text,
		          bagasi_kabin_kg, bagasi_checkin_kg, unit, klien, tiket_drive_file_id,
		          NULL::text,
		          NULL::text, NULL::text, NULL::text,
		          NULL::text, NULL::text, NULL::text,
		          NULL::text, NULL::text,
		          terminal, transit_berangkat, transit_pulang,
		          bagasi_checkin_berangkat_kg, bagasi_checkin_pulang_kg,
		          harga_tiket_berangkat, harga_tiket_pulang,
		          created_at, updated_at`,
		tripID, body.PesertaID, body.TglPemesanan, body.Pemesanan, body.Agent, hargaTiket,
		body.KodeBooking, body.NoEtiket, body.Maskapai, body.RuteBerangkat,
		body.TglBerangkatFlight, body.JamBerangkat, body.RutePulang, body.TglPulangFlight,
		body.JamPulang, body.BagasiKabinKg, body.BagasiCheckinKg, body.Unit, body.Klien,
		paymentScheduleID,
		body.Terminal, body.TransitBerangkat, body.TransitPulang,
		body.BagasiCheckinBerangkatKg, body.BagasiCheckinPulangKg,
		body.HargaTiketBerangkat, body.HargaTiketPulang,
	).Scan(
		&k.ID, &k.TripID, &k.PesertaID, &k.PaymentScheduleID,
		&k.TglPemesanan, &k.Pemesanan, &k.Agent,
		&k.HargaTiket, &k.KodeBooking, &k.NoEtiket, &k.Maskapai,
		&k.RuteBerangkat, &k.TglBerangkatFlight, &k.JamBerangkat,
		&k.RutePulang, &k.TglPulangFlight, &k.JamPulang,
		&k.BagasiKabinKg, &k.BagasiCheckinKg, &k.Unit, &k.Klien, &k.TiketDriveFileID,
		&k.LimitPembayaran,
		&k.Title, &k.NamaLengkap, &k.NoPaspor,
		&k.PlaceOfBirth, &k.TglLahir, &k.PlaceOfIssued,
		&k.IssuedDate, &k.ExpiryDate,
		&k.Terminal, &k.TransitBerangkat, &k.TransitPulang,
		&k.BagasiCheckinBerangkatKg, &k.BagasiCheckinPulangKg,
		&k.HargaTiketBerangkat, &k.HargaTiketPulang,
		&k.CreatedAt, &k.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(201)
	jsonOK(w, k)
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

func (h *Handler) UpdateKeberangkatan(w http.ResponseWriter, r *http.Request) {
	kid := chi.URLParam(r, "kid")
	tripID := chi.URLParam(r, "id")
	var body struct {
		PesertaID          *string  `json:"peserta_id"`
		TglPemesanan       *string  `json:"tgl_pemesanan"`
		Pemesanan          *string  `json:"pemesanan"`
		Agent              *string  `json:"agent"`
		LimitPembayaran    *string  `json:"limit_pembayaran"`
		HargaTiket         *float64 `json:"harga_tiket"`
		KodeBooking        *string  `json:"kode_booking"`
		NoEtiket           *string  `json:"no_etiket"`
		Maskapai           *string  `json:"maskapai"`
		RuteBerangkat      *string  `json:"rute_berangkat"`
		TglBerangkatFlight *string  `json:"tgl_berangkat_flight"`
		JamBerangkat       *string  `json:"jam_berangkat"`
		RutePulang         *string  `json:"rute_pulang"`
		TglPulangFlight    *string  `json:"tgl_pulang_flight"`
		JamPulang          *string  `json:"jam_pulang"`
		BagasiKabinKg      *float64 `json:"bagasi_kabin_kg"`
		BagasiCheckinKg    *float64 `json:"bagasi_checkin_kg"`
		Unit               *int     `json:"unit"`
		Klien              *string  `json:"klien"`
		Terminal                 *string  `json:"terminal"`
		TransitBerangkat         *string  `json:"transit_berangkat"`
		TransitPulang            *string  `json:"transit_pulang"`
		BagasiCheckinBerangkatKg *float64 `json:"bagasi_checkin_berangkat_kg"`
		BagasiCheckinPulangKg    *float64 `json:"bagasi_checkin_pulang_kg"`
		HargaTiketBerangkat      *float64 `json:"harga_tiket_berangkat"`
		HargaTiketPulang         *float64 `json:"harga_tiket_pulang"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body")
		return
	}

	ctx := r.Context()

	// harga_tiket = harga_tiket_berangkat + harga_tiket_pulang (recomputed from new + existing values)
	var hargaTiket *float64
	if body.HargaTiketBerangkat != nil || body.HargaTiketPulang != nil {
		var existingBerangkat, existingPulang *float64
		h.DB.QueryRow(ctx, `SELECT harga_tiket_berangkat, harga_tiket_pulang FROM manifest_keberangkatan WHERE id = $1::uuid`, kid).
			Scan(&existingBerangkat, &existingPulang)
		berangkat := body.HargaTiketBerangkat
		if berangkat == nil {
			berangkat = existingBerangkat
		}
		pulang := body.HargaTiketPulang
		if pulang == nil {
			pulang = existingPulang
		}
		total := 0.0
		if berangkat != nil {
			total += *berangkat
		}
		if pulang != nil {
			total += *pulang
		}
		hargaTiket = &total
	}

	// Upsert payment schedule if limit_pembayaran provided
	if body.LimitPembayaran != nil && *body.LimitPembayaran != "" &&
		hargaTiket != nil && *hargaTiket > 0 {
		var existingPSID *string
		h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_keberangkatan WHERE id = $1::uuid`, kid).Scan(&existingPSID)

		deskripsi := body.KodeBooking
		if existingPSID != nil {
			h.DB.Exec(ctx, `
				UPDATE payment_schedules SET deadline = $1::date, amount = $2, deskripsi = $3 WHERE id = $4::uuid`,
				body.LimitPembayaran, hargaTiket, deskripsi, *existingPSID)
		} else {
			var psID string
			err := h.DB.QueryRow(ctx, `
				INSERT INTO payment_schedules (trip_id, jenis, deskripsi, deadline, amount)
				VALUES ($1::uuid, 'TIKET', $2, $3::date, $4)
				RETURNING id::text`,
				tripID, deskripsi, body.LimitPembayaran, hargaTiket,
			).Scan(&psID)
			if err == nil {
				h.DB.Exec(ctx, `UPDATE manifest_keberangkatan SET payment_schedule_id = $1::uuid WHERE id = $2::uuid`, psID, kid)
			}
		}
	}

	_, err := h.DB.Exec(ctx, `
		UPDATE manifest_keberangkatan SET
		  peserta_id          = COALESCE($2::uuid, peserta_id),
		  tgl_pemesanan       = COALESCE($3::date, tgl_pemesanan),
		  pemesanan           = COALESCE($4, pemesanan),
		  agent               = COALESCE($5, agent),
		  harga_tiket         = COALESCE($6, harga_tiket),
		  kode_booking        = COALESCE($7, kode_booking),
		  no_etiket           = COALESCE($8, no_etiket),
		  maskapai            = COALESCE($9, maskapai),
		  rute_berangkat      = COALESCE($10, rute_berangkat),
		  tgl_berangkat_flight= COALESCE($11::date, tgl_berangkat_flight),
		  jam_berangkat       = COALESCE($12::time, jam_berangkat),
		  rute_pulang         = COALESCE($13, rute_pulang),
		  tgl_pulang_flight   = COALESCE($14::date, tgl_pulang_flight),
		  jam_pulang          = COALESCE($15::time, jam_pulang),
		  bagasi_kabin_kg     = COALESCE($16, bagasi_kabin_kg),
		  bagasi_checkin_kg   = COALESCE($17, bagasi_checkin_kg),
		  unit                = COALESCE($18, unit),
		  klien               = COALESCE($19, klien),
		  terminal                    = COALESCE($21, terminal),
		  transit_berangkat           = COALESCE($22, transit_berangkat),
		  transit_pulang              = COALESCE($23, transit_pulang),
		  bagasi_checkin_berangkat_kg = COALESCE($24, bagasi_checkin_berangkat_kg),
		  bagasi_checkin_pulang_kg    = COALESCE($25, bagasi_checkin_pulang_kg),
		  harga_tiket_berangkat       = COALESCE($26, harga_tiket_berangkat),
		  harga_tiket_pulang          = COALESCE($27, harga_tiket_pulang),
		  updated_at          = $20
		WHERE id = $1::uuid`,
		kid, body.PesertaID, body.TglPemesanan, body.Pemesanan, body.Agent,
		hargaTiket, body.KodeBooking, body.NoEtiket, body.Maskapai, body.RuteBerangkat,
		body.TglBerangkatFlight, body.JamBerangkat, body.RutePulang, body.TglPulangFlight,
		body.JamPulang, body.BagasiKabinKg, body.BagasiCheckinKg, body.Unit, body.Klien,
		time.Now(),
		body.Terminal, body.TransitBerangkat, body.TransitPulang,
		body.BagasiCheckinBerangkatKg, body.BagasiCheckinPulangKg,
		body.HargaTiketBerangkat, body.HargaTiketPulang,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteKeberangkatan(w http.ResponseWriter, r *http.Request) {
	kid := chi.URLParam(r, "kid")
	ctx := r.Context()

	// Fetch payment_schedule_id before deletion
	var psID *string
	h.DB.QueryRow(ctx, `SELECT payment_schedule_id::text FROM manifest_keberangkatan WHERE id = $1::uuid`, kid).Scan(&psID)

	_, err := h.DB.Exec(ctx, `DELETE FROM manifest_keberangkatan WHERE id = $1::uuid`, kid)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Delete associated payment schedule
	if psID != nil {
		h.DB.Exec(ctx, `DELETE FROM payment_schedules WHERE id = $1::uuid`, *psID)
	}

	w.WriteHeader(204)
}

// ── UPLOAD TIKET ──────────────────────────────────────────────────────────────

func (h *Handler) UploadTiket(w http.ResponseWriter, r *http.Request) {
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

	// Fetch trip info
	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx, `SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID).
		Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	log.Printf("[TIKET] uploading file=%s trip=%s", header.Filename, tripID)

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

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "4. Data Tiket Penerbangan")
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
		log.Printf("[TIKET] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[TIKET] uploaded: fileID=%s url=%s", fileID, viewURL)

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── OCR TIKET ─────────────────────────────────────────────────────────────────

const tiketOcrPrompt = `Baca dokumen PDF tiket penerbangan ini secara lengkap dan kembalikan HANYA JSON valid berikut (tanpa markdown, tanpa teks lain):

{
  "maskapai": "nama maskapai",
  "rute_berangkat": "rute keberangkatan, contoh CGK-MNL-KIX",
  "tgl_berangkat": "YYYY-MM-DD",
  "jam_berangkat": "HH:MM",
  "rute_pulang": "rute kepulangan, contoh NRT-MNL-CGK",
  "tgl_pulang": "YYYY-MM-DD",
  "jam_pulang": "HH:MM",
  "bagasi_kabin_kg": 7,
  "bagasi_checkin_kg": 30,
  "terminal": "Terminal 3",
  "transit_berangkat": "MNL · 2j 30m",
  "transit_pulang": "",
  "bagasi_checkin_berangkat_kg": 30,
  "bagasi_checkin_pulang_kg": 30,
  "booking_groups": [
    {
      "kode_booking": "EOP49E",
      "peserta": [
        {"nama": "IDA AYU GEDE MIRAH DHANVANTYA", "no_etiket": "079-6507914564/65"},
        {"nama": "NI GUSTI AYU PUTU EKA YUDHA", "no_etiket": "079-6507914568/69"}
      ]
    },
    {
      "kode_booking": "EOR2CS",
      "peserta": [
        {"nama": "IDA AYU MADE WANGI GENITRI", "no_etiket": "079-5064793390/91"}
      ]
    }
  ]
}

ATURAN WAJIB:

1. NAMA PESERTA
   - PDF menulis nama seperti: "IDA AYU GEDE MIRAH (First name) DHANVANTYA (Last name)"
   - Gabungkan menjadi: "IDA AYU GEDE MIRAH DHANVANTYA" (hapus "(First name)", "(Last name)", "(Middle name)")
   - Selalu UPPERCASE

2. NOMOR E-TIKET
   - Satu peserta biasanya punya 2 nomor e-tiket berurutan untuk pergi-pulang
   - Contoh: 079-6507914564 dan 079-6507914565 → tulis "079-6507914564/65"
   - Format: nomor pertama LENGKAP + "/" + 2 digit terakhir nomor kedua
   - Jika hanya ada 1 nomor, tulis lengkap saja

3. KODE BOOKING (PNR/Airline Booking Reference)
   - Kode 6 karakter seperti EOP49E, EOR2CS, Y9NPU9
   - Kelompokkan semua peserta dengan kode booking yang sama ke dalam 1 group
   - Satu group = 1 kode booking

4. DEDUPLIKASI
   - Peserta sama muncul berulang kali di tiap segmen penerbangan — tulis HANYA SEKALI per kode booking
   - Deduplikasi berdasarkan nomor e-tiket

5. LENGKAP
   - Sertakan SEMUA peserta dan SEMUA kode booking yang ada di PDF
   - Jangan lewatkan satupun

6. TERMINAL
   - Terminal keberangkatan jika tercantum, contoh "Terminal 1", "Terminal 2", "Terminal 3"
   - Jika tidak ada informasi terminal, kembalikan string kosong ""

7. TRANSIT
   - Jika rute berangkat/pulang memiliki lebih dari 1 segmen (transit), tulis "{kode bandara transit} · {durasi transit}" untuk setiap leg, contoh "MNL · 2j 30m"
   - Jika penerbangan langsung (tanpa transit), kembalikan string kosong ""
   - transit_berangkat untuk rute_berangkat, transit_pulang untuk rute_pulang

8. BAGASI CHECK-IN PER LEG
   - bagasi_checkin_berangkat_kg dan bagasi_checkin_pulang_kg: jika tiket membedakan jatah bagasi check-in per arah, isi sesuai masing-masing
   - Jika tidak dibedakan, isi keduanya dengan nilai bagasi_checkin_kg yang sama

Kembalikan JSON saja. Tidak ada penjelasan, tidak ada markdown.`

func (h *Handler) OcrTiket(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("[OCR-TIKET] received file: %s | size: %d bytes", header.Filename, header.Size)

	data, err := io.ReadAll(file)
	if err != nil {
		jsonErr(w, 500, "failed to read file")
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	log.Printf("[OCR-TIKET] sending to Anthropic (%d bytes base64)...", len(b64))

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
				{"type": "text", "text": tiketOcrPrompt},
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

	log.Printf("[OCR-TIKET] anthropic response status: %d", resp.StatusCode)

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

	// 	text := `{
	//   "maskapai": "Philippine Airlines",
	//   "rute_berangkat": "CGK-MNL-KIX",
	//   "tgl_berangkat": "2026-01-29",
	//   "jam_berangkat": "01:20",
	//   "rute_pulang": "NRT-MNL-CGK",
	//   "tgl_pulang": "2026-02-04",
	//   "jam_pulang": "09:30",
	//   "bagasi_kabin_kg": 7,
	//   "bagasi_checkin_kg": 30,
	//   "booking_groups": [
	//     {
	//       "kode_booking": "EOP49E",
	//       "peserta": [
	//         {"nama": "IDA AYU GEDE MIRAH DHANVANTYA", "no_etiket": "079-6507914564/65"},
	//         {"nama": "NI GUSTI AYU PUTU EKA YUDHA", "no_etiket": "079-6507914568/69"},
	//         {"nama": "IDA BAGUS GD WIDNYANA SAPUTRA", "no_etiket": "079-6507914566/67"}
	//       ]
	//     },
	//     {
	//       "kode_booking": "EOR2CS",
	//       "peserta": [
	//         {"nama": "IDA AYU MADE WANGI GENITRI", "no_etiket": "079-5064793390/91"}
	//       ]
	//     }
	//   ]
	// }`

	log.Printf("[OCR-TIKET] raw result: %s", text)

	var result models.TicketOCRResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		jsonErr(w, 502, "ocr parse error: "+err.Error())
		return
	}

	totalPax := 0
	for _, bg := range result.BookingGroups {
		totalPax += len(bg.Peserta)
	}
	log.Printf("[OCR-TIKET] success: maskapai=%s rute=%s | booking_groups=%d total_pax=%d",
		result.Maskapai, result.RuteBerangkat, len(result.BookingGroups), totalPax)
	for _, bg := range result.BookingGroups {
		log.Printf("[OCR-TIKET]   kode=%s peserta=%d", bg.KodeBooking, len(bg.Peserta))
		for _, p := range bg.Peserta {
			log.Printf("[OCR-TIKET]     %s → %s", p.Nama, p.NoEtiket)
		}
	}
	jsonOK(w, result)
}

// ── CSV: shared builder ───────────────────────────────────────────────────────

var emptyRow19 = []string{"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""}

// buildKeberangkatanCSV generates the CSV bytes and returns (csvData, namaTrip, fileName, err).
// Used by both the download endpoint and the Drive upload endpoint.
func (h *Handler) buildKeberangkatanCSV(r *http.Request, tripID string) ([]byte, string, string, error) {
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
			mk.tgl_pemesanan::text, mk.pemesanan, mk.agent,
			mk.harga_tiket, mk.kode_booking, mk.no_etiket,
			mk.maskapai, mk.rute_berangkat, mk.tgl_berangkat_flight::text, mk.jam_berangkat::text,
			mk.rute_pulang, mk.tgl_pulang_flight::text, mk.jam_pulang::text,
			mk.bagasi_kabin_kg, mk.bagasi_checkin_kg,
			mk.unit, mk.klien,
			mp.title::text, mp.nama_lengkap, mp.no_paspor,
			mp.place_of_birth, mp.tgl_lahir::text, mp.place_of_issued,
			mp.issued_date::text, mp.expiry_date::text,
			ps.deadline::text
		FROM manifest_keberangkatan mk
		LEFT JOIN manifest_peserta mp ON mp.id = mk.peserta_id
		LEFT JOIN payment_schedules ps ON ps.id = mk.payment_schedule_id
		WHERE mk.trip_id = $1::uuid
		ORDER BY mk.created_at`, tripID)
	if err != nil {
		return nil, "", "", err
	}
	defer rows.Close()

	type kbRow struct {
		TglPemesanan       *string
		Pemesanan          *string
		Agent              *string
		HargaTiket         *float64
		KodeBooking        *string
		NoEtiket           *string
		Maskapai           *string
		RuteBerangkat      *string
		TglBerangkatFlight *string
		JamBerangkat       *string
		RutePulang         *string
		TglPulangFlight    *string
		JamPulang          *string
		BagasiKabinKg      *float64
		BagasiCheckinKg    *float64
		Unit               *int
		Klien              *string
		Title              *string
		NamaLengkap        *string
		NoPaspor           *string
		PlaceOfBirth       *string
		TglLahir           *string
		PlaceOfIssued      *string
		IssuedDate         *string
		ExpiryDate         *string
		LimitPembayaran    *string
	}

	var dataRows []kbRow
	for rows.Next() {
		var k kbRow
		if err := rows.Scan(
			&k.TglPemesanan, &k.Pemesanan, &k.Agent,
			&k.HargaTiket, &k.KodeBooking, &k.NoEtiket,
			&k.Maskapai, &k.RuteBerangkat, &k.TglBerangkatFlight, &k.JamBerangkat,
			&k.RutePulang, &k.TglPulangFlight, &k.JamPulang,
			&k.BagasiKabinKg, &k.BagasiCheckinKg,
			&k.Unit, &k.Klien,
			&k.Title, &k.NamaLengkap, &k.NoPaspor,
			&k.PlaceOfBirth, &k.TglLahir, &k.PlaceOfIssued,
			&k.IssuedDate, &k.ExpiryDate,
			&k.LimitPembayaran,
		); err != nil {
			continue
		}
		dataRows = append(dataRows, k)
	}

	// Determine flight info from first row for header
	maskapai := ""
	ruteBerangkat := ""
	tglBerangkatFlight := ""
	jamBerangkat := ""
	rutePulang := ""
	tglPulangFlight := ""
	jamPulang := ""
	bagasiKabin := ""
	bagasiCheckin := ""
	if len(dataRows) > 0 {
		first := dataRows[0]
		if first.Maskapai != nil {
			maskapai = *first.Maskapai
		}
		if first.RuteBerangkat != nil {
			ruteBerangkat = *first.RuteBerangkat
		}
		if first.TglBerangkatFlight != nil {
			tglBerangkatFlight = fmtDateDMY(*first.TglBerangkatFlight)
		}
		if first.JamBerangkat != nil {
			jamBerangkat = *first.JamBerangkat
		}
		if first.RutePulang != nil {
			rutePulang = *first.RutePulang
		}
		if first.TglPulangFlight != nil {
			tglPulangFlight = fmtDateDMY(*first.TglPulangFlight)
		}
		if first.JamPulang != nil {
			jamPulang = *first.JamPulang
		}
		if first.BagasiKabinKg != nil {
			bagasiKabin = fmt.Sprintf("%.0f KG", *first.BagasiKabinKg)
		}
		if first.BagasiCheckinKg != nil {
			bagasiCheckin = fmt.Sprintf("%.0f KG", *first.BagasiCheckinKg)
		}
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	cw := csv.NewWriter(&buf)

	writeRow19 := func(val string) {
		row := make([]string, 19)
		row[0] = val
		cw.Write(row)
	}

	// Header block
	writeRow19("ANGKASA YUDISTIRA TRAVEL")
	writeRow19("NOTE PEMESANAN TIKET - " + strings.ToUpper(namaTrip))
	writeRow19(tripDateRange(tglBerangkat, tglPulang))
	cw.Write(emptyRow19)
	writeRow19("MASKAPAI PENERBANGAN : " + maskapai)

	// Departure row
	depart := make([]string, 19)
	depart[0] = "KEBERANGKATAN : " + tglBerangkatFlight
	depart[3] = ""
	depart[4] = ruteBerangkat
	depart[5] = jamBerangkat
	cw.Write(depart)

	// Arrival row
	arrive := make([]string, 19)
	arrive[0] = "KEPULANGAN : " + tglPulangFlight
	arrive[4] = rutePulang
	arrive[5] = jamPulang
	cw.Write(arrive)

	cw.Write(emptyRow19)
	writeRow19("KETERANGAN BAGASI")
	writeRow19("BAGASI KABIN (HAND BAGGAGE) : " + bagasiKabin)
	writeRow19("CHECK IN BAGASI : " + bagasiCheckin)
	cw.Write(emptyRow19)

	// Column headers (two rows)
	cw.Write([]string{
		"NO ", "TGL PEMESANAN", "PEMESANAN", "AGENT", "LIMIT PEMBAYARAN", "HARGA TIKET",
		"KODE BOOKING", "E-TIKET NUMBER",
		"Title", "NAME", "PASSPORT NO", "BIRTH", "", "", "VALIDITY PASSPOR", "", "", "UNIT", "KLIEN",
	})
	cw.Write([]string{
		"", "", "", "", "", "", "", "",
		"", "", "", "PLACE", "AGE", "DATE", "PLACE OF ISSUED", "ISSUED DATE", "EXPIRY", "", "",
	})

	// Data rows.
	// Rules:
	//   tgl_pemesanan, pemesanan, agent, limit_pembayaran, harga_tiket, klien →
	//     shown ONLY when the value changes from the previous row (per-field independent).
	//   unit → shown when kode_booking changes from the previous row.
	//   kode_booking, e-tiket, passenger fields → always shown.
	//   totalHarga → accumulated each time harga_tiket appears (i.e. when it changes).
	seq := 1
	var totalHarga float64

	// Previous-row values for change detection
	prevTgl, prevPemes, prevAgent, prevLimit, prevHarga, prevKlien, prevKode := "", "", "", "", "", "", ""

	// showOnChange returns val if it differs from prev (or if first row), else "".
	showOnChange := func(i int, val, prev string) string {
		if i == 0 || val != prev {
			return val
		}
		return ""
	}

	for i, k := range dataRows {
		// Compute current formatted values
		curTgl := ""
		if k.TglPemesanan != nil {
			curTgl = fmtDateDMY(*k.TglPemesanan)
		}
		curPemes := coalesce(k.Pemesanan)
		curAgent := coalesce(k.Agent)
		curLimit := ""
		if k.LimitPembayaran != nil {
			curLimit = fmtDateDMY(*k.LimitPembayaran)
		}
		curHarga := ""
		if k.HargaTiket != nil {
			curHarga = fmt.Sprintf("%v", *k.HargaTiket)
		}
		curKlien := coalesce(k.Klien)
		curKode := coalesce(k.KodeBooking)

		// Fields shown only on change
		tglPemes := showOnChange(i, curTgl, prevTgl)
		pemesanan := showOnChange(i, curPemes, prevPemes)
		agent := showOnChange(i, curAgent, prevAgent)
		limitBayar := showOnChange(i, curLimit, prevLimit)
		klien := showOnChange(i, curKlien, prevKlien)

		hargaStr := ""
		if showOnChange(i, curHarga, prevHarga) != "" && k.HargaTiket != nil {
			totalHarga += *k.HargaTiket
			hargaStr = fmt.Sprintf("Rp%s", formatIDR(*k.HargaTiket))
		}

		// unit — shown only when kode_booking changes
		unitStr := ""
		if i == 0 || curKode != prevKode {
			if k.Unit != nil {
				unitStr = strconv.Itoa(*k.Unit)
			}
		}

		// Update previous values
		prevTgl, prevPemes, prevAgent, prevLimit = curTgl, curPemes, curAgent, curLimit
		prevHarga, prevKlien, prevKode = curHarga, curKlien, curKode

		// Passenger-level fields — always shown
		noEtiket := coalesce(k.NoEtiket)
		title := coalesce(k.Title)
		nama := coalesce(k.NamaLengkap)
		paspor := coalesce(k.NoPaspor)
		placeOfBirth := coalesce(k.PlaceOfBirth)
		age := ""
		if k.TglLahir != nil && *k.TglLahir != "" {
			age = strconv.Itoa(ageFromDateStr(*k.TglLahir))
		}
		tglLahirFmt := ""
		if k.TglLahir != nil {
			tglLahirFmt = fmtDateDMY(*k.TglLahir)
		}
		placeOfIssued := coalesce(k.PlaceOfIssued)
		issuedDateFmt := ""
		if k.IssuedDate != nil {
			issuedDateFmt = fmtDateDMY(*k.IssuedDate)
		}
		expiryFmt := ""
		if k.ExpiryDate != nil {
			expiryFmt = fmtDateDMY(*k.ExpiryDate)
		}

		cw.Write([]string{
			strconv.Itoa(seq), tglPemes, pemesanan, agent, limitBayar, hargaStr,
			curKode, noEtiket,
			title, nama, paspor, placeOfBirth, age, tglLahirFmt, placeOfIssued, issuedDateFmt, expiryFmt,
			unitStr, klien,
		})
		seq++
	}

	// Footer:
	// totalHarga = sum of each unique-run harga (counts once per value change, not per row)
	// avg = totalHarga / totalPax (all pax rows)
	totalPax := len(dataRows)
	avgHarga := 0.0
	if totalPax > 0 {
		avgHarga = totalHarga / float64(totalPax)
	}

	totalRow := make([]string, 19)
	totalRow[2] = fmt.Sprintf("TOTAL %d PAX", totalPax)
	totalRow[5] = fmt.Sprintf("Rp%s", formatIDR(totalHarga))
	cw.Write(totalRow)

	avgRow := make([]string, 19)
	avgRow[2] = "HARGA RATA-RATA PERPAX"
	avgRow[5] = fmt.Sprintf("Rp%s", formatIDR(avgHarga))
	cw.Write(avgRow)

	cw.Flush()

	fileName := fmt.Sprintf("manifest_keberangkatan_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))

	return buf.Bytes(), namaTrip, fileName, nil
}

// ── EXPORT CSV (download) ─────────────────────────────────────────────────────

func (h *Handler) ExportKeberangkatanCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	data, _, fileName, err := h.buildKeberangkatanCSV(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	w.Write(data)
}

// ── UPLOAD CSV TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadKeberangkatanCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	data, _, fileName, err := h.buildKeberangkatanCSV(r, tripID)
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

	tiketFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "4. Data Tiket Penerbangan")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	_, viewURL, err := drv.UploadFile(ctx, tiketFolder, fileName, "text/csv", bytes.NewReader(data))
	if err != nil {
		log.Printf("[KEBERANGKATAN-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[KEBERANGKATAN-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func coalesce(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// formatIDR formats a float64 as Indonesian number format with thousands separator
func formatIDR(amount float64) string {
	intPart := int64(amount)
	s := strconv.FormatInt(intPart, 10)
	// Add thousands separators
	n := len(s)
	var result []byte
	for i, c := range s {
		if i > 0 && (n-i)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(c))
	}
	return string(result)
}
