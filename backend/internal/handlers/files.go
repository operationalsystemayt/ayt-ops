package handlers

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/services"
)

func (h *Handler) uploadDoc(w http.ResponseWriter, r *http.Request, docType string) {
	tripID := chi.URLParam(r, "id")
	pesertaID := chi.URLParam(r, "pid")
	ctx := r.Context()

	if err := r.ParseMultipartForm(15 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form"); return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "field 'file' required"); return
	}
	defer file.Close()

	// Fetch peserta + trip info in one query
	var namaLengkap, namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx, `
		SELECT mp.nama_lengkap, t.nama_trip, t.drive_folder_id
		FROM manifest_peserta mp
		JOIN trips t ON t.id = mp.trip_id
		WHERE mp.id = $1::uuid AND mp.trip_id = $2::uuid`,
		pesertaID, tripID,
	).Scan(&namaLengkap, &namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "peserta not found"); return
	}

	log.Printf("[DRIVE/%s] uploading for peserta=%s trip=%s file=%s", strings.ToUpper(docType), pesertaID, tripID, header.Filename)

	// Init Drive service
	drv, err := services.NewDriveService(ctx)
	if err != nil {
		log.Printf("[DRIVE/%s] ERROR: %v", strings.ToUpper(docType), err)
		jsonErr(w, 503, err.Error()); return
	}

	// Create trip root folder in Drive if not yet created
	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "failed to create trip folder: "+err.Error()); return
	}
	driveFolderID = &folderID

	// Ensure "1. Data Paspor & KTP" → sub-folder
	parentFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "1. Data Paspor & KTP")
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	subName := map[string]string{"paspor": "Paspor", "ktp": "KTP"}[docType]
	subFolder, err := drv.EnsureFolder(ctx, parentFolder, subName)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	// Build filename: NAMA_LENGKAP.ext
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	fileName := fmt.Sprintf("%s%s",
		strings.ToUpper(strings.ReplaceAll(namaLengkap, " ", "_")), ext)

	mimeType := detectMime(header.Header.Get("Content-Type"), header.Filename)

	// Upload
	fileID, viewURL, err := drv.UploadFile(ctx, subFolder, fileName, mimeType, file)
	if err != nil {
		log.Printf("[DRIVE/%s] ERROR upload failed: %v", strings.ToUpper(docType), err)
		jsonErr(w, 500, "drive upload failed: "+err.Error()); return
	}
	log.Printf("[DRIVE/%s] uploaded: fileID=%s url=%s", strings.ToUpper(docType), fileID, viewURL)

	// Update DB column
	col := map[string]string{"paspor": "paspor_drive_file_id", "ktp": "ktp_drive_file_id"}[docType]
	h.DB.Exec(ctx, fmt.Sprintf(`UPDATE manifest_peserta SET %s = $1, updated_at = NOW() WHERE id = $2::uuid`, col),
		fileID, pesertaID)

	jsonOK(w, map[string]string{
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

func (h *Handler) UploadPaspor(w http.ResponseWriter, r *http.Request) { h.uploadDoc(w, r, "paspor") }
func (h *Handler) UploadKtp(w http.ResponseWriter, r *http.Request)    { h.uploadDoc(w, r, "ktp") }
