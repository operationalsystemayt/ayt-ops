package handlers

import (
	"archive/zip"
	"bytes"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"ayt-ops/backend/internal/models"
	"ayt-ops/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// ── LIST ─────────────────────────────────────────────────────────────────────

func (h *Handler) ListItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	rows, err := h.DB.Query(r.Context(), `
		SELECT id::text, trip_id::text, file_name, drive_file_id,
		       COALESCE(drive_view_url, ''), COALESCE(mime_type, ''),
		       created_at, updated_at
		FROM trip_itinerary
		WHERE trip_id = $1::uuid
		ORDER BY created_at ASC`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	list := []models.TripItinerary{}
	for rows.Next() {
		var item models.TripItinerary
		if err := rows.Scan(
			&item.ID, &item.TripID, &item.FileName, &item.DriveFileId,
			&item.DriveViewUrl, &item.MimeType,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			jsonErr(w, 500, err.Error())
			return
		}
		list = append(list, item)
	}
	jsonOK(w, list)
}

// ── UPLOAD ────────────────────────────────────────────────────────────────────

func (h *Handler) UploadItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "field 'file' required")
		return
	}
	defer file.Close()

	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx,
		`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "3. Data Itinerary")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	fileName := header.Filename
	if fileName == "" {
		fileName = "itinerary" + filepath.Ext(header.Filename)
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = detectMime(mimeType, header.Filename)
	}

	fileID, viewURL, err := drv.UploadFile(ctx, subFolder, fileName, mimeType, file)
	if err != nil {
		log.Printf("[ITINERARY] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}
	log.Printf("[ITINERARY] uploaded: fileID=%s url=%s", fileID, viewURL)

	var item models.TripItinerary
	err = h.DB.QueryRow(ctx, `
		INSERT INTO trip_itinerary (trip_id, file_name, drive_file_id, drive_view_url, mime_type)
		VALUES ($1::uuid, $2, $3, $4, $5)
		RETURNING id::text, trip_id::text, file_name, drive_file_id,
		          COALESCE(drive_view_url, ''), COALESCE(mime_type, ''),
		          created_at, updated_at`,
		tripID, fileName, fileID, viewURL, mimeType,
	).Scan(
		&item.ID, &item.TripID, &item.FileName, &item.DriveFileId,
		&item.DriveViewUrl, &item.MimeType,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, "db insert: "+err.Error())
		return
	}

	w.WriteHeader(201)
	jsonOK(w, item)
}

// ── REPLACE ───────────────────────────────────────────────────────────────────

func (h *Handler) ReplaceItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	iid := chi.URLParam(r, "iid")
	ctx := r.Context()

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		jsonErr(w, 400, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, 400, "field 'file' required")
		return
	}
	defer file.Close()

	var oldDriveFileID string
	err = h.DB.QueryRow(ctx,
		`SELECT drive_file_id FROM trip_itinerary WHERE id = $1::uuid AND trip_id = $2::uuid`,
		iid, tripID,
	).Scan(&oldDriveFileID)
	if err != nil {
		jsonErr(w, 404, "itinerary record not found")
		return
	}

	var namaTrip string
	var driveFolderID *string
	err = h.DB.QueryRow(ctx,
		`SELECT nama_trip, drive_folder_id FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found")
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "3. Data Itinerary")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	fileName := header.Filename
	if fileName == "" {
		fileName = "itinerary" + filepath.Ext(header.Filename)
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = detectMime(mimeType, header.Filename)
	}

	fileID, viewURL, err := drv.UploadFile(ctx, subFolder, fileName, mimeType, file)
	if err != nil {
		log.Printf("[ITINERARY] replace upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	// Delete old Drive file (best-effort)
	if oldDriveFileID != "" {
		if delErr := drv.DeleteFile(ctx, oldDriveFileID); delErr != nil {
			log.Printf("[ITINERARY] delete old file %s: %v (best effort)", oldDriveFileID, delErr)
		}
	}

	var item models.TripItinerary
	err = h.DB.QueryRow(ctx, `
		UPDATE trip_itinerary
		SET file_name = $1, drive_file_id = $2, drive_view_url = $3, mime_type = $4, updated_at = NOW()
		WHERE id = $5::uuid AND trip_id = $6::uuid
		RETURNING id::text, trip_id::text, file_name, drive_file_id,
		          COALESCE(drive_view_url, ''), COALESCE(mime_type, ''),
		          created_at, updated_at`,
		fileName, fileID, viewURL, mimeType, iid, tripID,
	).Scan(
		&item.ID, &item.TripID, &item.FileName, &item.DriveFileId,
		&item.DriveViewUrl, &item.MimeType,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		jsonErr(w, 500, "db update: "+err.Error())
		return
	}

	jsonOK(w, item)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

func (h *Handler) DeleteItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	iid := chi.URLParam(r, "iid")
	ctx := r.Context()

	var driveFileID string
	err := h.DB.QueryRow(ctx,
		`SELECT drive_file_id FROM trip_itinerary WHERE id = $1::uuid AND trip_id = $2::uuid`,
		iid, tripID,
	).Scan(&driveFileID)
	if err != nil {
		jsonErr(w, 404, "itinerary record not found")
		return
	}

	_, err = h.DB.Exec(ctx,
		`DELETE FROM trip_itinerary WHERE id = $1::uuid AND trip_id = $2::uuid`,
		iid, tripID,
	)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	// Delete Drive file (best-effort)
	if driveFileID != "" {
		drv, drvErr := services.NewDriveService(ctx)
		if drvErr == nil {
			if delErr := drv.DeleteFile(ctx, driveFileID); delErr != nil {
				log.Printf("[ITINERARY] delete drive file %s: %v (best effort)", driveFileID, delErr)
			}
		}
	}

	w.WriteHeader(204)
}

// ── buildItineraryZip ─────────────────────────────────────────────────────────

type itineraryItem struct {
	fileName    string
	driveFileID string
}

func (h *Handler) getItineraryItems(r *http.Request, tripID string) ([]itineraryItem, string, error) {
	ctx := r.Context()

	var namaTrip string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`,
		tripID,
	).Scan(&namaTrip)
	if err != nil {
		return nil, "", fmt.Errorf("trip not found")
	}

	rows, err := h.DB.Query(ctx, `
		SELECT file_name, drive_file_id
		FROM trip_itinerary
		WHERE trip_id = $1::uuid
		ORDER BY created_at ASC`, tripID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var items []itineraryItem
	for rows.Next() {
		var item itineraryItem
		if err := rows.Scan(&item.fileName, &item.driveFileID); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, namaTrip, nil
}

func buildItineraryZipBuffer(drv *services.DriveService, r *http.Request, items []itineraryItem) (bytes.Buffer, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, item := range items {
		data, _, err := drv.DownloadFile(r.Context(), item.driveFileID)
		if err != nil {
			log.Printf("[ITINERARY-ZIP] skip file %s (%s): %v", item.fileName, item.driveFileID, err)
			continue // best effort
		}
		f, err := zw.Create(item.fileName)
		if err != nil {
			log.Printf("[ITINERARY-ZIP] zip create entry %s: %v", item.fileName, err)
			continue
		}
		if _, err := f.Write(data); err != nil {
			log.Printf("[ITINERARY-ZIP] zip write entry %s: %v", item.fileName, err)
		}
	}

	if err := zw.Close(); err != nil {
		return buf, err
	}
	return buf, nil
}

// ── EXPORT ZIP ────────────────────────────────────────────────────────────────

func (h *Handler) ExportZipItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	items, namaTrip, err := h.getItineraryItems(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	buf, err := buildItineraryZipBuffer(drv, r, items)
	if err != nil {
		jsonErr(w, 500, "zip error: "+err.Error())
		return
	}

	zipName := fmt.Sprintf("itinerary_%s.zip", slugifyName(namaTrip))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, zipName))
	w.Write(buf.Bytes())
}

// ── UPLOAD ZIP TO DRIVE ───────────────────────────────────────────────────────

func (h *Handler) UploadZipItinerary(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	items, namaTrip, err := h.getItineraryItems(r, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}

	buf, err := buildItineraryZipBuffer(drv, r, items)
	if err != nil {
		jsonErr(w, 500, "zip error: "+err.Error())
		return
	}

	var driveFolderID *string
	h.DB.QueryRow(ctx, `SELECT drive_folder_id FROM trips WHERE id = $1::uuid`, tripID).
		Scan(&driveFolderID)

	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error())
		return
	}
	driveFolderID = &folderID

	subFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "3. Data Itinerary")
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}

	zipName := fmt.Sprintf("itinerary_%s_%s.zip", slugifyName(namaTrip), time.Now().Format("02Jan2006"))
	_, viewURL, err := drv.UploadFile(ctx, subFolder, zipName, "application/zip", bytes.NewReader(buf.Bytes()))
	if err != nil {
		log.Printf("[ITINERARY-ZIP] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error())
		return
	}

	log.Printf("[ITINERARY-ZIP] uploaded: %s → %s", zipName, viewURL)
	jsonOK(w, map[string]string{
		"file_name":      zipName,
		"drive_view_url": viewURL,
	})
}
