package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

func (h *Handler) ListPeserta(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT id::text, trip_id::text, no_urut, title::text, nama_lengkap, no_paspor,
		       place_of_birth, tgl_lahir::text, place_of_issued, issued_date::text,
		       expiry_date::text, room_type::text, unit, klien, meals::text,
		       paspor_drive_file_id, ktp_drive_file_id, visa_drive_file_id,
		       visa_status::text, created_at, updated_at
		FROM manifest_peserta WHERE trip_id = $1::uuid ORDER BY no_urut`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	list := []models.ManifestPeserta{}
	for rows.Next() {
		var p models.ManifestPeserta
		if err := rows.Scan(&p.ID, &p.TripID, &p.NoUrut, &p.Title, &p.NamaLengkap, &p.NoPaspor,
			&p.PlaceOfBirth, &p.TglLahir, &p.PlaceOfIssued, &p.IssuedDate, &p.ExpiryDate,
			&p.RoomType, &p.Unit, &p.Klien, &p.Meals, &p.PasporDriveFileID, &p.KtpDriveFileID,
			&p.VisaDriveFileID, &p.VisaStatus, &p.CreatedAt, &p.UpdatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, p)
	}
	jsonOK(w, list)
}

func (h *Handler) CreatePeserta(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		NoUrut        int     `json:"no_urut"`
		Title         *string `json:"title"`
		NamaLengkap   string  `json:"nama_lengkap"`
		NoPaspor      *string `json:"no_paspor"`
		PlaceOfBirth  *string `json:"place_of_birth"`
		TglLahir      *string `json:"tgl_lahir"`
		PlaceOfIssued *string `json:"place_of_issued"`
		IssuedDate    *string `json:"issued_date"`
		ExpiryDate    *string `json:"expiry_date"`
		RoomType      *string `json:"room_type"`
		Unit          *int    `json:"unit"`
		Klien         *string `json:"klien"`
		Meals         *string `json:"meals"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	if body.NamaLengkap == "" {
		jsonErr(w, 400, "nama_lengkap required"); return
	}
	body.Title    = nilIfEmpty(body.Title)
	body.RoomType = nilIfEmpty(body.RoomType)
	body.Meals    = nilIfEmpty(body.Meals)

	var p models.ManifestPeserta
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO manifest_peserta
		  (trip_id, no_urut, title, nama_lengkap, no_paspor, place_of_birth, tgl_lahir,
		   place_of_issued, issued_date, expiry_date, room_type, unit, klien, meals)
		VALUES
		  ($1::uuid, $2, $3::peserta_title, $4, $5, $6, $7::date,
		   $8, $9::date, $10::date, $11::room_type, $12, $13, $14::meal_type)
		RETURNING id::text, trip_id::text, no_urut, title::text, nama_lengkap, no_paspor,
		          place_of_birth, tgl_lahir::text, place_of_issued, issued_date::text,
		          expiry_date::text, room_type::text, unit, klien, meals::text,
		          paspor_drive_file_id, ktp_drive_file_id, visa_drive_file_id,
		          visa_status::text, created_at, updated_at`,
		tripID, body.NoUrut, body.Title, body.NamaLengkap, body.NoPaspor,
		body.PlaceOfBirth, body.TglLahir, body.PlaceOfIssued, body.IssuedDate,
		body.ExpiryDate, body.RoomType, body.Unit, body.Klien, body.Meals,
	).Scan(&p.ID, &p.TripID, &p.NoUrut, &p.Title, &p.NamaLengkap, &p.NoPaspor,
		&p.PlaceOfBirth, &p.TglLahir, &p.PlaceOfIssued, &p.IssuedDate, &p.ExpiryDate,
		&p.RoomType, &p.Unit, &p.Klien, &p.Meals, &p.PasporDriveFileID, &p.KtpDriveFileID,
		&p.VisaDriveFileID, &p.VisaStatus, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(201)
	jsonOK(w, p)
}

func (h *Handler) UpdatePeserta(w http.ResponseWriter, r *http.Request) {
	pesertaID := chi.URLParam(r, "pid")
	var body struct {
		NoUrut        *int    `json:"no_urut"`
		Title         *string `json:"title"`
		NamaLengkap   *string `json:"nama_lengkap"`
		NoPaspor      *string `json:"no_paspor"`
		PlaceOfBirth  *string `json:"place_of_birth"`
		TglLahir      *string `json:"tgl_lahir"`
		PlaceOfIssued *string `json:"place_of_issued"`
		IssuedDate    *string `json:"issued_date"`
		ExpiryDate    *string `json:"expiry_date"`
		RoomType      *string `json:"room_type"`
		Unit          *int    `json:"unit"`
		Klien         *string `json:"klien"`
		Meals         *string `json:"meals"`
		VisaStatus    *string `json:"visa_status"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	body.Title      = nilIfEmpty(body.Title)
	body.RoomType   = nilIfEmpty(body.RoomType)
	body.Meals      = nilIfEmpty(body.Meals)
	body.VisaStatus = nilIfEmpty(body.VisaStatus)

	_, err := h.DB.Exec(r.Context(), `
		UPDATE manifest_peserta SET
		  no_urut        = COALESCE($2, no_urut),
		  title          = COALESCE($3::peserta_title, title),
		  nama_lengkap   = COALESCE($4, nama_lengkap),
		  no_paspor      = COALESCE($5, no_paspor),
		  place_of_birth = COALESCE($6, place_of_birth),
		  tgl_lahir      = COALESCE($7::date, tgl_lahir),
		  place_of_issued= COALESCE($8, place_of_issued),
		  issued_date    = COALESCE($9::date, issued_date),
		  expiry_date    = COALESCE($10::date, expiry_date),
		  room_type      = COALESCE($11::room_type, room_type),
		  unit           = COALESCE($12, unit),
		  klien          = COALESCE($13, klien),
		  meals          = COALESCE($14::meal_type, meals),
		  visa_status    = COALESCE($15::visa_status_type, visa_status),
		  updated_at     = $16
		WHERE id = $1::uuid`,
		pesertaID, body.NoUrut, body.Title, body.NamaLengkap, body.NoPaspor,
		body.PlaceOfBirth, body.TglLahir, body.PlaceOfIssued, body.IssuedDate,
		body.ExpiryDate, body.RoomType, body.Unit, body.Klien, body.Meals,
		body.VisaStatus, time.Now(),
	)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}

func (h *Handler) DeletePeserta(w http.ResponseWriter, r *http.Request) {
	pesertaID := chi.URLParam(r, "pid")
	_, err := h.DB.Exec(r.Context(),
		`DELETE FROM manifest_peserta WHERE id = $1::uuid`, pesertaID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}
