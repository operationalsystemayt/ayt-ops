package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

// jsonbParam converts a json.RawMessage body field into a string pointer so it
// can be sent as a `text` parameter and cast to `jsonb` in SQL (COALESCE($n::jsonb, col)).
func jsonbParam(raw []byte) *string {
	if raw == nil {
		return nil
	}
	s := string(raw)
	return &s
}

func (h *Handler) ListTrips(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := r.URL.Query().Get("status")
	tripType := r.URL.Query().Get("trip_type")
	q := r.URL.Query().Get("q")

	query := `
		SELECT id::text, nama_trip, rab_master_id, tgl_berangkat::text, tgl_pulang::text,
		       total_pax, jumlah_malam, trip_category::text, negara, trip_type::text,
		       status::text, drive_folder_id, created_at, updated_at
		FROM trips
		WHERE deleted_at IS NULL`
	args := []any{}

	if status != "" {
		args = append(args, status)
		query += ` AND status = $` + strconv.Itoa(len(args)) + `::trip_status`
	}
	if tripType != "" {
		args = append(args, tripType)
		query += ` AND trip_type = $` + strconv.Itoa(len(args)) + `::trip_type_type`
	}
	if q != "" {
		args = append(args, "%"+q+"%")
		query += ` AND nama_trip ILIKE $` + strconv.Itoa(len(args))
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
			&t.TotalPax, &t.JumlahMalam, &t.TripCategory, &t.Negara, &t.TripType,
			&t.Status, &t.DriveFolderID, &t.CreatedAt, &t.UpdatedAt); err != nil {
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
		JumlahMalam  *int    `json:"jumlah_malam"`
		TripCategory string  `json:"trip_category"`
		Negara       *string `json:"negara"`
		TripType     string  `json:"trip_type"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	if body.NamaTrip == "" || body.TglBerangkat == "" {
		jsonErr(w, 400, "nama_trip and tgl_berangkat are required"); return
	}
	if body.TripCategory == "" {
		body.TripCategory = "domestik"
	}
	if body.TripType == "" {
		body.TripType = "open_trip"
	}

	ctx := context.Background()
	var t models.Trip
	err := h.DB.QueryRow(ctx, `
		INSERT INTO trips (nama_trip, rab_master_id, tgl_berangkat, tgl_pulang, total_pax,
		                   jumlah_malam, trip_category, negara, trip_type)
		VALUES ($1, $2, $3::date, $4::date, $5, $6, $7::trip_category_type, $8, $9::trip_type_type)
		RETURNING id::text, nama_trip, rab_master_id, tgl_berangkat::text, tgl_pulang::text,
		          total_pax, jumlah_malam, trip_category::text, negara, trip_type::text,
		          status::text, drive_folder_id, created_at, updated_at`,
		body.NamaTrip, body.RabMasterID, body.TglBerangkat, body.TglPulang, body.TotalPax,
		body.JumlahMalam, body.TripCategory, body.Negara, body.TripType,
	).Scan(&t.ID, &t.NamaTrip, &t.RabMasterID, &t.TglBerangkat, &t.TglPulang,
		&t.TotalPax, &t.JumlahMalam, &t.TripCategory, &t.Negara, &t.TripType,
		&t.Status, &t.DriveFolderID, &t.CreatedAt, &t.UpdatedAt)
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
		       total_pax, jumlah_malam, trip_category::text, negara, trip_type::text,
		       status::text, drive_folder_id, transportasi_kurs_list, created_at, updated_at
		FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, id,
	).Scan(&t.ID, &t.NamaTrip, &t.RabMasterID, &t.TglBerangkat, &t.TglPulang,
		&t.TotalPax, &t.JumlahMalam, &t.TripCategory, &t.Negara, &t.TripType,
		&t.Status, &t.DriveFolderID, &t.TransportasiKursList, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		jsonErr(w, 404, "trip not found"); return
	}
	jsonOK(w, t)
}

func (h *Handler) UpdateTrip(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		NamaTrip             *string         `json:"nama_trip"`
		RabMasterID          *string         `json:"rab_master_id"`
		TglBerangkat         *string         `json:"tgl_berangkat"`
		TglPulang            *string         `json:"tgl_pulang"`
		TotalPax             *int            `json:"total_pax"`
		Status               *string         `json:"status"`
		TransportasiKursList json.RawMessage `json:"transportasi_kurs_list"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}

	_, err := h.DB.Exec(r.Context(), `
		UPDATE trips SET
		  nama_trip     = COALESCE($2, nama_trip),
		  rab_master_id = COALESCE($3, rab_master_id),
		  tgl_berangkat = COALESCE($4::date, tgl_berangkat),
		  tgl_pulang    = COALESCE($5::date, tgl_pulang),
		  total_pax     = COALESCE($6, total_pax),
		  status        = COALESCE($7::trip_status, status),
		  transportasi_kurs_list = COALESCE($8::jsonb, transportasi_kurs_list),
		  updated_at    = $9
		WHERE id = $1::uuid AND deleted_at IS NULL`,
		id, body.NamaTrip, body.RabMasterID, body.TglBerangkat, body.TglPulang, body.TotalPax, body.Status,
		jsonbParam(body.TransportasiKursList), time.Now(),
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
