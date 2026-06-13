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

// ListRab returns full RabMaster objects from the JSONB `data` column.
func (h *Handler) ListRab(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(),
		`SELECT data FROM rab_master ORDER BY updated_at DESC`)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	result := []json.RawMessage{}
	for rows.Next() {
		var d []byte
		if err := rows.Scan(&d); err != nil {
			continue
		}
		result = append(result, json.RawMessage(d))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetRab returns a single full RabMaster from the JSONB `data` column.
func (h *Handler) GetRab(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var d []byte
	err := h.DB.QueryRow(r.Context(),
		`SELECT data FROM rab_master WHERE id = $1`, id,
	).Scan(&d)
	if err != nil {
		jsonErr(w, 404, "RAB not found"); return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(d)
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
	guide := intVal(header["jumlah_guide"])
	driver := intVal(header["jumlah_driver"])
	hargaJual := floatVal(body["harga_jual"])

	// kurs summary column = first entry of kurs_list (if any)
	var kurs float64
	if kursList, ok := header["kurs_list"].([]any); ok && len(kursList) > 0 {
		if first, ok := kursList[0].(map[string]any); ok {
			kurs = floatVal(first["value"])
		}
	}

	dataJSON, err := json.Marshal(body)
	if err != nil {
		jsonErr(w, 500, "failed to marshal data"); return
	}

	now := time.Now()
	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO rab_master (id, nama, jumlah_pax, jumlah_hari, jumlah_malam, jumlah_tl,
		                        jumlah_guide, jumlah_driver, kurs, harga_jual, data, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
		ON CONFLICT (id) DO UPDATE SET
		  nama         = EXCLUDED.nama,
		  jumlah_pax   = EXCLUDED.jumlah_pax,
		  jumlah_hari  = EXCLUDED.jumlah_hari,
		  jumlah_malam = EXCLUDED.jumlah_malam,
		  jumlah_tl    = EXCLUDED.jumlah_tl,
		  jumlah_guide = EXCLUDED.jumlah_guide,
		  jumlah_driver= EXCLUDED.jumlah_driver,
		  kurs         = EXCLUDED.kurs,
		  harga_jual   = EXCLUDED.harga_jual,
		  data         = EXCLUDED.data,
		  updated_at   = EXCLUDED.updated_at`,
		id, nama, pax, hari, malam, tl, guide, driver, kurs, hargaJual, dataJSON, now,
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
