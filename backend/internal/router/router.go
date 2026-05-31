package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"ayt-ops/backend/internal/handlers"
)

func New(db *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: false,
	}))

	h := &handlers.Handler{DB: db}

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})

	// Trips
	r.Route("/api/trips", func(r chi.Router) {
		r.Get("/", h.ListTrips)
		r.Post("/", h.CreateTrip)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", h.GetTrip)
			r.Put("/", h.UpdateTrip)
			r.Delete("/", h.DeleteTrip)

			// Manifest peserta
			r.Get("/peserta", h.ListPeserta)
			r.Post("/peserta", h.CreatePeserta)
			r.Put("/peserta/{pid}", h.UpdatePeserta)
			r.Delete("/peserta/{pid}", h.DeletePeserta)
			r.Post("/peserta/{pid}/paspor", h.UploadPaspor)
			r.Post("/peserta/{pid}/ktp", h.UploadKtp)

			// Payments
			r.Get("/payments", h.ListPayments)
			r.Post("/payments", h.CreatePayment)
			r.Delete("/payments/{pay}", h.DeletePayment)

			// Notes
			r.Get("/notes", h.ListNotes)
			r.Post("/notes", h.CreateNote)
			r.Put("/notes/{nid}", h.UpdateNote)
			r.Delete("/notes/{nid}", h.DeleteNote)

			// Laba
			r.Get("/laba", h.GetLaba)
		})
	})

	// RAB Master
	r.Get("/api/rab", h.ListRab)
	r.Post("/api/rab", h.UpsertRab)
	r.Delete("/api/rab/{id}", h.DeleteRab)

	// OCR
	r.Post("/api/ocr/paspor", h.OcrPaspor)

	// Reminders
	r.Get("/api/reminders/upcoming", h.UpcomingReminders)

	return r
}
