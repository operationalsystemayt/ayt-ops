package handlers

import (
	"context"
	"strconv"
	"strings"
	"time"

	"ayt-ops/backend/internal/services"
)

// ensureTripFolder returns the Drive folder ID for a trip's root folder,
// creating the nested folder structure
// /{trip_category}/{tahun_keberangkatan}/{negara}/{trip_type}/{nama_trip}/
// for trips that don't yet have a drive_folder_id. Trips that already have
// one keep their existing (flat) folder as-is.
func (h *Handler) ensureTripFolder(ctx context.Context, drv *services.DriveService, tripID string) (string, error) {
	var driveFolderID *string
	var namaTrip, tripCategory, tripType, tglBerangkat string
	var negara *string

	err := h.DB.QueryRow(ctx, `
		SELECT drive_folder_id, nama_trip, trip_category::text, trip_type::text, negara, tgl_berangkat::text
		FROM trips WHERE id = $1::uuid`, tripID,
	).Scan(&driveFolderID, &namaTrip, &tripCategory, &tripType, &negara, &tglBerangkat)
	if err != nil {
		return "", err
	}

	if driveFolderID != nil && *driveFolderID != "" {
		return *driveFolderID, nil
	}

	year := tglBerangkat
	if t, perr := time.Parse("2006-01-02", tglBerangkat); perr == nil {
		year = strconv.Itoa(t.Year())
	} else if len(tglBerangkat) >= 4 {
		year = tglBerangkat[:4]
	}

	negaraSeg := ""
	if negara != nil {
		negaraSeg = strings.TrimSpace(*negara)
	}
	if negaraSeg == "" {
		negaraSeg = "Lainnya"
	}

	segments := []string{tripCategory, year, negaraSeg, tripType, namaTrip}

	parentID := drv.RootFolderID
	var folderID string
	for _, seg := range segments {
		if seg == "" {
			continue
		}
		fid, ferr := drv.EnsureFolder(ctx, parentID, seg)
		if ferr != nil {
			return "", ferr
		}
		parentID = fid
		folderID = fid
	}

	if _, uerr := h.DB.Exec(ctx, `UPDATE trips SET drive_folder_id = $1 WHERE id = $2::uuid`, folderID, tripID); uerr != nil {
		return "", uerr
	}

	return folderID, nil
}
