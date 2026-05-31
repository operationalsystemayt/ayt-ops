package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

func (h *Handler) ListPayments(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id::text, p.trip_id::text, p.peserta_id::text, mp.nama_lengkap,
		       p.jenis::text, p.amount, p.tgl_bayar::text, p.bukti_drive_file_id,
		       p.catatan, p.created_by, p.created_at
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
			&p.Catatan, &p.CreatedBy, &p.CreatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, p)
	}
	jsonOK(w, list)
}

func (h *Handler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		PesertaID *string `json:"peserta_id"`
		Jenis     string  `json:"jenis"`
		Amount    float64 `json:"amount"`
		TglBayar  string  `json:"tgl_bayar"`
		Catatan   *string `json:"catatan"`
		CreatedBy *string `json:"created_by"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	if body.Amount <= 0 || body.TglBayar == "" {
		jsonErr(w, 400, "amount and tgl_bayar required"); return
	}
	if body.Jenis == "" {
		body.Jenis = "dp"
	}

	var p models.TripPayment
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO trip_payments (trip_id, peserta_id, jenis, amount, tgl_bayar, catatan, created_by)
		VALUES ($1::uuid, $2::uuid, $3::payment_jenis, $4, $5::date, $6, $7)
		RETURNING id::text, trip_id::text, peserta_id::text, NULL::text,
		          jenis::text, amount, tgl_bayar::text, bukti_drive_file_id,
		          catatan, created_by, created_at`,
		tripID, body.PesertaID, body.Jenis, body.Amount, body.TglBayar,
		body.Catatan, body.CreatedBy,
	).Scan(&p.ID, &p.TripID, &p.PesertaID, &p.NamaPeserta,
		&p.Jenis, &p.Amount, &p.TglBayar, &p.BuktiDriveFileID,
		&p.Catatan, &p.CreatedBy, &p.CreatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(201)
	jsonOK(w, p)
}

func (h *Handler) DeletePayment(w http.ResponseWriter, r *http.Request) {
	payID := chi.URLParam(r, "pay")
	_, err := h.DB.Exec(r.Context(), `DELETE FROM trip_payments WHERE id = $1::uuid`, payID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}
