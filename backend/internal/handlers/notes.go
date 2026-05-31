package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/models"
)

func (h *Handler) ListNotes(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT id::text, trip_id::text, content, created_by, created_at, updated_at
		FROM trip_notes WHERE trip_id = $1::uuid ORDER BY created_at DESC`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	list := []models.TripNote{}
	for rows.Next() {
		var n models.TripNote
		if err := rows.Scan(&n.ID, &n.TripID, &n.Content, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt); err != nil {
			jsonErr(w, 500, err.Error()); return
		}
		list = append(list, n)
	}
	jsonOK(w, list)
}

func (h *Handler) CreateNote(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var body struct {
		Content   string  `json:"content"`
		CreatedBy *string `json:"created_by"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}
	if body.Content == "" {
		jsonErr(w, 400, "content required"); return
	}

	var n models.TripNote
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO trip_notes (trip_id, content, created_by)
		VALUES ($1::uuid, $2, $3)
		RETURNING id::text, trip_id::text, content, created_by, created_at, updated_at`,
		tripID, body.Content, body.CreatedBy,
	).Scan(&n.ID, &n.TripID, &n.Content, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(201)
	jsonOK(w, n)
}

func (h *Handler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	noteID := chi.URLParam(r, "nid")
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil {
		jsonErr(w, 400, "invalid body"); return
	}

	_, err := h.DB.Exec(r.Context(),
		`UPDATE trip_notes SET content = $2, updated_at = $3 WHERE id = $1::uuid`,
		noteID, body.Content, time.Now())
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}

func (h *Handler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	noteID := chi.URLParam(r, "nid")
	_, err := h.DB.Exec(r.Context(), `DELETE FROM trip_notes WHERE id = $1::uuid`, noteID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	w.WriteHeader(204)
}
