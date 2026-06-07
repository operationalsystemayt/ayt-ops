package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// GetRabRealisasiState returns the saved working state for the 2k tab, or null if none.
func (h *Handler) GetRabRealisasiState(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	var data json.RawMessage
	err := h.DB.QueryRow(r.Context(),
		`SELECT data FROM trip_rab_realisasi WHERE trip_id = $1::uuid`, tripID,
	).Scan(&data)
	if err != nil {
		// No saved state — return null so frontend falls back to RAB master defaults
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte("null"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// SaveRabRealisasiState upserts the working state for the 2k tab.
func (h *Handler) SaveRabRealisasiState(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		jsonErr(w, 400, "invalid body")
		return
	}
	// Validate it is valid JSON
	if !json.Valid(body) {
		jsonErr(w, 400, "body must be valid JSON")
		return
	}
	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO trip_rab_realisasi (trip_id, data, updated_at)
		VALUES ($1::uuid, $2, NOW())
		ON CONFLICT (trip_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
		tripID, body,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// UploadRabRealisasiCSV accepts a raw CSV body from the frontend (which owns the
// editable RAB working state) and uploads it to Drive under
// <trip folder>/12. RAB Realisasi/.
func (h *Handler) UploadRabRealisasiCSV(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	csvData, err := io.ReadAll(r.Body)
	if err != nil {
		jsonErr(w, 400, "failed to read body")
		return
	}

	var namaTrip string
	var driveFolderID *string
	h.DB.QueryRow(ctx,
		`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid`, tripID,
	).Scan(&namaTrip, &driveFolderID)

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	if driveFolderID == nil {
		folderID, err := drv.EnsureFolder(ctx, drv.RootFolderID, namaTrip)
		if err != nil {
			jsonErr(w, 500, "create trip folder: "+err.Error())
			return
		}
		driveFolderID = &folderID
		h.DB.Exec(ctx, `UPDATE trips SET drive_folder_id = $1 WHERE id = $2::uuid`, folderID, tripID)
	}

	rabFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "12. RAB Realisasi")
	if err != nil {
		jsonErr(w, 500, "create rab-realisasi folder: "+err.Error())
		return
	}

	fileName := fmt.Sprintf("rab_vs_realisasi_%s.csv", time.Now().Format("20060102_150405"))

	_, viewURL, err := drv.UploadFile(ctx, rabFolder, fileName, "text/csv", bytes.NewReader(csvData))
	if err != nil {
		log.Printf("[RAB-REALISASI-CSV] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[RAB-REALISASI-CSV] uploaded: %s → %s", fileName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_view_url": viewURL,
	})
}
