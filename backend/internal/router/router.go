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
			r.Post("/peserta/manifest-csv", h.ExportManifestToDrive)       // static before {pid}
			r.Post("/passport-compilation", h.PassportCompilation)
			r.Put("/peserta/{pid}", h.UpdatePeserta)
			r.Delete("/peserta/{pid}", h.DeletePeserta)
			r.Post("/peserta/{pid}/paspor", h.UploadPaspor)
			r.Post("/peserta/{pid}/ktp", h.UploadKtp)

			// Visa
			r.Post("/peserta/{pid}/visa", h.UploadVisa)
			r.Delete("/peserta/{pid}/visa", h.DeleteVisa)
			r.Get("/visa/export-csv", h.ExportVisaCSV)
			r.Post("/visa/upload-csv", h.UploadVisaCSV)

			// Payments
			r.Get("/payments", h.ListPayments)
			r.Post("/payments", h.CreatePayment)
			r.Get("/payments/export-csv", h.ExportPaymentsCSV)   // static before {pay}
			r.Post("/payments/upload-csv", h.UploadPaymentsCSV)  // static before {pay}
			r.Delete("/payments/{pay}", h.DeletePayment)

			// Notes
			r.Get("/notes", h.ListNotes)
			r.Post("/notes", h.CreateNote)
			r.Put("/notes/{nid}", h.UpdateNote)
			r.Delete("/notes/{nid}", h.DeleteNote)

			// Manifest keberangkatan
			r.Get("/keberangkatan", h.ListKeberangkatan)
			r.Post("/keberangkatan", h.CreateKeberangkatan)
			r.Post("/keberangkatan/upload-tiket", h.UploadTiket)         // static before {kid}
			r.Post("/keberangkatan/ocr-tiket", h.OcrTiket)               // static before {kid}
			r.Get("/keberangkatan/export-csv", h.ExportKeberangkatanCSV) // static before {kid}
			r.Post("/keberangkatan/upload-csv", h.UploadKeberangkatanCSV) // static before {kid}
			r.Put("/keberangkatan/{kid}", h.UpdateKeberangkatan)
			r.Delete("/keberangkatan/{kid}", h.DeleteKeberangkatan)

			// Manifest hotel
			r.Get("/hotel", h.ListHotel)
			r.Post("/hotel", h.CreateHotel)
			r.Post("/hotel/upload-nota", h.UploadNotaHotel)        // static before {hid}
			r.Post("/hotel/ocr-nota", h.OcrNotaHotel)              // static before {hid}
			r.Get("/hotel/export-csv", h.ExportHotelCSV)           // static before {hid}
			r.Post("/hotel/upload-csv", h.UploadHotelCSV)          // static before {hid}
			r.Put("/hotel/{hid}", h.UpdateHotel)
			r.Delete("/hotel/{hid}", h.DeleteHotel)

			// Manifest transportasi
			r.Get("/transportasi", h.ListTransportasi)
			r.Post("/transportasi", h.CreateTransportasi)
			r.Post("/transportasi/upload-nota", h.UploadNotaTransportasi)        // static before {tid}
			r.Post("/transportasi/ocr-nota", h.OcrNotaTransportasi)              // static before {tid}
			r.Get("/transportasi/export-csv", h.ExportTransportasiCSV)           // static before {tid}
			r.Post("/transportasi/upload-csv", h.UploadTransportasiCSV)          // static before {tid}
			r.Put("/transportasi/{tid}", h.UpdateTransportasi)
			r.Delete("/transportasi/{tid}", h.DeleteTransportasi)

			// Manifest optional tour
			r.Get("/optional-tour", h.ListOptionalTour)
			r.Post("/optional-tour", h.CreateOptionalTour)
			r.Post("/optional-tour/ocr-tiket", h.OcrTiketOptional)               // static before {oid}
			r.Get("/optional-tour/export-csv", h.ExportOptionalTourCSV)           // static before {oid}
			r.Post("/optional-tour/upload-csv", h.UploadOptionalTourCSV)          // static before {oid}
			r.Put("/optional-tour/{oid}/tiket", h.ReplaceOptionalTiket)           // before {oid} plain
			r.Put("/optional-tour/{oid}", h.UpdateOptionalTour)
			r.Delete("/optional-tour/{oid}", h.DeleteOptionalTour)

			// Itinerary
			r.Get("/itinerary", h.ListItinerary)
			r.Post("/itinerary", h.UploadItinerary)
			r.Get("/itinerary/export-zip", h.ExportZipItinerary)   // static before {iid}
			r.Post("/itinerary/upload-zip", h.UploadZipItinerary)  // static before {iid}
			r.Put("/itinerary/{iid}", h.ReplaceItinerary)
			r.Delete("/itinerary/{iid}", h.DeleteItinerary)

			// RAB vs Realisasi
			r.Get("/rab-realisasi", h.GetRabRealisasiState)
			r.Post("/rab-realisasi", h.SaveRabRealisasiState)
			r.Post("/rab-realisasi/upload-csv", h.UploadRabRealisasiCSV)

			// Asuransi
			r.Get("/asuransi", h.ListAsuransi)
			r.Post("/asuransi", h.CreateAsuransi)
			r.Get("/asuransi/export-zip", h.ExportZipAsuransi)   // static before {aid}
			r.Post("/asuransi/upload-zip", h.UploadZipAsuransi)  // static before {aid}
			r.Put("/asuransi/{aid}", h.UpdateAsuransi)
			r.Put("/asuransi/{aid}/file", h.ReplaceAsuransiFile)
			r.Delete("/asuransi/{aid}", h.DeleteAsuransi)

			// Laba
			r.Get("/laba", h.GetLaba)
		})
	})

	// RAB Master
	r.Get("/api/rab", h.ListRab)
	r.Post("/api/rab", h.UpsertRab)
	r.Get("/api/rab/{id}", h.GetRab)
	r.Delete("/api/rab/{id}", h.DeleteRab)

	// OCR
	r.Post("/api/ocr/paspor", h.OcrPaspor)

	// Reminders
	r.Get("/api/reminders/upcoming", h.UpcomingReminders)

	return r
}
