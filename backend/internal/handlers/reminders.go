package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

func (h *Handler) UpcomingReminders(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT ps.id::text, ps.trip_id::text, t.nama_trip, ps.jenis::text, ps.deskripsi,
		       ps.deadline::text, ps.amount, ps.status::text,
		       (ps.deadline - CURRENT_DATE)::int AS days_until
		FROM payment_schedules ps
		JOIN trips t ON t.id = ps.trip_id
		WHERE ps.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 4
		  AND ps.status = 'pending'
		  AND t.deleted_at IS NULL
		ORDER BY ps.deadline ASC`)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	list := []models.PaymentSchedule{}
	for rows.Next() {
		var s models.PaymentSchedule
		if err := rows.Scan(&s.ID, &s.TripID, &s.NamaTrip, &s.Jenis, &s.Deskripsi,
			&s.Deadline, &s.Amount, &s.Status, &s.DaysUntil); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, s)
	}
	jsonOK(w, list)
}

func (h *Handler) GetLaba(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var laba models.LabaResult
	laba.TripID = tripID

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(CASE WHEN jenis = 'diskon' THEN -amount ELSE amount END),0) FROM trip_payments WHERE trip_id=$1::uuid`, tripID,
	).Scan(&laba.TotalPemasukan)

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(harga_tiket),0) FROM manifest_keberangkatan WHERE trip_id=$1::uuid`, tripID,
	).Scan(&laba.PengeluaranTiket)

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(total_idr),0) FROM manifest_hotel WHERE trip_id=$1::uuid`, tripID,
	).Scan(&laba.PengeluaranHotel)

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(total_idr),0) FROM manifest_transportasi WHERE trip_id=$1::uuid`, tripID,
	).Scan(&laba.PengeluaranTransport)

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(harga_beli_idr * array_length(peserta_ids,1)),0) FROM manifest_optional_tour WHERE trip_id=$1::uuid`, tripID,
	).Scan(&laba.PengeluaranOptional)

	h.DB.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(amount),0) FROM realisasi_items WHERE trip_id=$1::uuid AND tipe='pengeluaran'`, tripID,
	).Scan(&laba.PengeluaranLainnya)

	var totalPax int
	h.DB.QueryRow(r.Context(), `SELECT total_pax FROM trips WHERE id=$1::uuid`, tripID).Scan(&totalPax)

	laba.TotalPengeluaran = laba.PengeluaranTiket + laba.PengeluaranHotel +
		laba.PengeluaranTransport + laba.PengeluaranOptional + laba.PengeluaranLainnya
	laba.LabaAktual = laba.TotalPemasukan - laba.TotalPengeluaran
	if totalPax > 0 {
		laba.LabaPerPax = laba.LabaAktual / float64(totalPax)
	}
	jsonOK(w, laba)
}
