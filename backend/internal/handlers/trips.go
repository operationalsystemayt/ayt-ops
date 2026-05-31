package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

func (h *Handler) ListTrips(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := r.URL.Query().Get("status")

	query := `
		SELECT id::text, nama_trip, rab_master_id, tgl_berangkat::text, tgl_pulang::text,
		       total_pax, status::text, drive_folder_id, created_at, updated_at
		FROM trips
		WHERE deleted_at IS NULL`
	args := []any{}

	if status != "" {
		query += ` AND status = $1::trip_status`
		args = append(args, status)
	}
	query += ` ORDER BY tgl_berangkat DESC`

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	trips := []models.Trip{}
	for rows.Next() {
		var t models.Trip
		if err := rows.Scan(&t.ID, &t.NamaTrip, &t.RabMasterID, &t.TglBerangkat, &t.TglPulang,
			&t.TotalPax, &t.Status, &t.DriveFolderID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		trips = append(trips, t)
	}
	jsonOK(w, trips)
}

func (h *Handler) CreateTrip(w http.ResponseWriter, r *http.Request) {
	var body struct {
		NamaTrip     string  `json:"nama_trip"`
		RabMasterID  *string `json:"rab_master_id"`
		TglBerangkat string  `json:"tgl_berangkat"`
		TglPulang    string  `json:"tgl_pulang"`
		TotalPax     int     `json:"total_pax"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	if body.NamaTrip == "" || body.TglBerangkat == "" {
		jsonErr(w, 400, "nama_trip and tgl_berangkat are required"); return
	}

	ctx := context.Background()
	var t models.Trip
	err := h.DB.QueryRow(ctx, `
		INSERT INTO trips (nama_trip, rab_master_id, tgl_berangkat, tgl_pulang, total_pax)
		VALUES ($1, $2, $3::date, $4::date, $5)
		RETURNING id::text, nama_trip, rab_master_id, tgl_berangkat::text, tgl_pulang::text,
		          total_pax, status::text, drive_folder_id, created_at, updated_at`,
		body.NamaTrip, body.RabMasterID, body.TglBerangkat, body.TglPulang, body.TotalPax,
	).Scan(&t.ID, &t.NamaTrip, &t.RabMasterID, &t.TglBerangkat, &t.TglPulang,
		&t.TotalPax, &t.Status, &t.DriveFolderID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(201)
	jsonOK(w, t)
}

func (h *Handler) GetTrip(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var t models.Trip
	err := h.DB.QueryRow(r.Context(), `
		SELECT id::text, nama_trip, rab_master_id, tgl_berangkat::text, tgl_pulang::text,
		       total_pax, status::text, drive_folder_id, created_at, updated_at
		FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, id,
	).Scan(&t.ID, &t.NamaTrip, &t.RabMasterID, &t.TglBerangkat, &t.TglPulang,
		&t.TotalPax, &t.Status, &t.DriveFolderID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		jsonErr(w, 404, "trip not found"); return
	}
	jsonOK(w, t)
}

func (h *Handler) UpdateTrip(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		NamaTrip     *string `json:"nama_trip"`
		TglBerangkat *string `json:"tgl_berangkat"`
		TglPulang    *string `json:"tgl_pulang"`
		TotalPax     *int    `json:"total_pax"`
		Status       *string `json:"status"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}

	_, err := h.DB.Exec(r.Context(), `
		UPDATE trips SET
		  nama_trip     = COALESCE($2, nama_trip),
		  tgl_berangkat = COALESCE($3::date, tgl_berangkat),
		  tgl_pulang    = COALESCE($4::date, tgl_pulang),
		  total_pax     = COALESCE($5, total_pax),
		  status        = COALESCE($6::trip_status, status),
		  updated_at    = $7
		WHERE id = $1::uuid AND deleted_at IS NULL`,
		id, body.NamaTrip, body.TglBerangkat, body.TglPulang, body.TotalPax, body.Status, time.Now(),
	)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	h.GetTrip(w, r)
}

func (h *Handler) DeleteTrip(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.DB.Exec(r.Context(),
		`UPDATE trips SET deleted_at = NOW() WHERE id = $1::uuid`, id)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}
