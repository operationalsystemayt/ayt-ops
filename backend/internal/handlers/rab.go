package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

type RabSummary struct {
	ID          string    `json:"id"`
	Nama        string    `json:"nama"`
	JumlahPax   int       `json:"jumlah_pax"`
	JumlahHari  int       `json:"jumlah_hari"`
	JumlahMalam int       `json:"jumlah_malam"`
	JumlahTL    int       `json:"jumlah_tl"`
	Kurs        float64   `json:"kurs"`
	HargaJual   float64   `json:"harga_jual"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (h *Handler) ListRab(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT id, nama, COALESCE(jumlah_pax,0), COALESCE(jumlah_hari,0),
		       COALESCE(jumlah_malam,0), COALESCE(jumlah_tl,0),
		       COALESCE(kurs,1), COALESCE(harga_jual,0), updated_at
		FROM rab_master ORDER BY updated_at DESC`)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	list := []RabSummary{}
	for rows.Next() {
		var s RabSummary
		if err := rows.Scan(&s.ID, &s.Nama, &s.JumlahPax, &s.JumlahHari,
			&s.JumlahMalam, &s.JumlahTL, &s.Kurs, &s.HargaJual, &s.UpdatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, s)
	}
	jsonOK(w, list)
}

func (h *Handler) UpsertRab(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}

	id, _ := body["id"].(string)
	if id == "" {
		jsonErr(w, 400, "id required"); return
	}

	// Extract header fields
	header, _ := body["header"].(map[string]any)
	nama, _ := header["nama"].(string)
	pax := intVal(header["jumlah_pax"])
	hari := intVal(header["jumlah_hari"])
	malam := intVal(header["jumlah_malam"])
	tl := intVal(header["jumlah_tl"])
	kurs := floatVal(header["kurs"])
	hargaJual := floatVal(body["harga_jual"])

	dataJSON, err := json.Marshal(body)
	if err != nil {
		jsonErr(w, 500, "failed to marshal data"); return
	}

	now := time.Now()
	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO rab_master (id, nama, jumlah_pax, jumlah_hari, jumlah_malam, jumlah_tl,
		                        kurs, harga_jual, data, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
		ON CONFLICT (id) DO UPDATE SET
		  nama        = EXCLUDED.nama,
		  jumlah_pax  = EXCLUDED.jumlah_pax,
		  jumlah_hari = EXCLUDED.jumlah_hari,
		  jumlah_malam= EXCLUDED.jumlah_malam,
		  jumlah_tl   = EXCLUDED.jumlah_tl,
		  kurs        = EXCLUDED.kurs,
		  harga_jual  = EXCLUDED.harga_jual,
		  data        = EXCLUDED.data,
		  updated_at  = EXCLUDED.updated_at`,
		id, nama, pax, hari, malam, tl, kurs, hargaJual, dataJSON, now,
	)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}

func (h *Handler) DeleteRab(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.DB.Exec(r.Context(), `DELETE FROM rab_master WHERE id = $1`, id)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}

// helpers for type-asserting numeric values from JSON (number can be float64 or int)
func intVal(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}

func floatVal(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}
