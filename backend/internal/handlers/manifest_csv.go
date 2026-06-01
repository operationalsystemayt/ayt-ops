package handlers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/services"
)

// 13-column template matching sample_manifest_master.csv
var emptyRow13 = []string{"", "", "", "", "", "", "", "", "", "", "", "", ""}

func (h *Handler) ExportManifestToDrive(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	var namaTrip, tglBerangkat, tglPulang string
	var driveFolderID *string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, tgl_berangkat::text, tgl_pulang::text, drive_folder_id
		 FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID,
	).Scan(&namaTrip, &tglBerangkat, &tglPulang, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found"); return
	}

	rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(title::text,''), nama_lengkap,
		       COALESCE(room_type::text,''), COALESCE(no_paspor,''),
		       COALESCE(place_of_birth,''), COALESCE(tgl_lahir::text,''),
		       COALESCE(place_of_issued,''), COALESCE(issued_date::text,''),
		       COALESCE(expiry_date::text,''), COALESCE(unit::text,''),
		       COALESCE(klien,'')
		FROM manifest_peserta WHERE trip_id = $1::uuid ORDER BY no_urut`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM for Excel
	cw := csv.NewWriter(&buf)

	// ── Header block ──────────────────────────────────────────────────────────
	writeRow(cw, "ANGKASA YUDISTIRA TRAVEL")
	writeRow(cw, "NOTE PEMESANAN TIKET - "+strings.ToUpper(namaTrip))
	writeRow(cw, tripDateRange(tglBerangkat, tglPulang))
	cw.Write(emptyRow13)

	// Two-row column header
	cw.Write([]string{"NO ", "Title", "NAME", "ROOM TYPE", "PASSPORT NO",
		"BIRTH", "", "", "VALIDITY PASSPOR", "", "", "UNIT", "KLIEN"})
	cw.Write([]string{"", "", "", "", "",
		"PLACE", "AGE", "DATE", "PLACE OF ISSUED", "ISSUED DATE", "EXPIRY", "", ""})

	// ── Data rows ─────────────────────────────────────────────────────────────
	seq := 1
	for rows.Next() {
		var title, nama, roomType, paspor, placeOfBirth, tglLahir,
			placeOfIssued, issuedDate, expiryDate, unit, klien string
		if err := rows.Scan(&title, &nama, &roomType, &paspor, &placeOfBirth, &tglLahir,
			&placeOfIssued, &issuedDate, &expiryDate, &unit, &klien); err != nil {
			continue
		}
		age := ""
		if tglLahir != "" {
			age = strconv.Itoa(ageFromDateStr(tglLahir))
		}
		cw.Write([]string{
			strconv.Itoa(seq), title, nama, roomType, paspor,
			placeOfBirth, age, fmtDateDMY(tglLahir),
			placeOfIssued, fmtDateDMY(issuedDate), fmtDateDMY(expiryDate),
			unit, klien,
		})
		seq++
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	for range 4 {
		cw.Write(emptyRow13)
	}
	cw.Write([]string{"", "SUDAH PUNYA VISA", "", "", "", "", "", "", "", "", "", "", ""})
	cw.Write([]string{"", "URUS VISA SENDIRI", "", "", "", "", "", "", "", "", "", "", ""})
	cw.Flush()

	// ── Drive upload ──────────────────────────────────────────────────────────
	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error()); return
	}
	if driveFolderID == nil {
		folderID, err := drv.EnsureFolder(ctx, drv.RootFolderID, namaTrip)
		if err != nil {
			jsonErr(w, 500, "create trip folder: "+err.Error()); return
		}
		driveFolderID = &folderID
		h.DB.Exec(ctx, `UPDATE trips SET drive_folder_id = $1 WHERE id = $2::uuid`, folderID, tripID)
	}

	fileName := fmt.Sprintf("manifest_peserta_%s_%s.csv",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"))
	fileID, viewURL, err := drv.UploadFile(ctx, *driveFolderID, fileName, "text/csv", bytes.NewReader(buf.Bytes()))
	if err != nil {
		log.Printf("[MANIFEST-CSV] upload error: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error()); return
	}
	log.Printf("[MANIFEST-CSV] uploaded: %s → %s", fileName, viewURL)

	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// writeRow writes a single value in the first cell, rest empty (13 cols total).
func writeRow(cw *csv.Writer, val string) {
	row := make([]string, 13)
	row[0] = val
	cw.Write(row)
}

// tripDateRange formats "2026-01-29" + "2026-02-04" → "29 JAN - 4 FEB 2026"
func tripDateRange(start, end string) string {
	s, err1 := time.Parse("2006-01-02", start)
	e, err2 := time.Parse("2006-01-02", end)
	if err1 != nil || err2 != nil {
		return start + " - " + end
	}
	return fmt.Sprintf("%d %s - %d %s %d",
		s.Day(), strings.ToUpper(s.Format("Jan")),
		e.Day(), strings.ToUpper(e.Format("Jan")),
		e.Year())
}

// ── helpers ───────────────────────────────────────────────────────────────────

func ageFromDateStr(s string) int {
	birth, err := time.Parse("2006-01-02", s)
	if err != nil {
		return 0
	}
	now := time.Now()
	years := now.Year() - birth.Year()
	if now.Month() < birth.Month() || (now.Month() == birth.Month() && now.Day() < birth.Day()) {
		years--
	}
	return years
}

// fmtDateDMY "2006-01-02" → "9 Aug 1981" (no leading zero, title-case month)
func fmtDateDMY(s string) string {
	if s == "" {
		return ""
	}
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return s
	}
	return fmt.Sprintf("%d %s %d", d.Day(), d.Format("Jan"), d.Year())
}

func slugifyName(s string) string {
	return strings.Map(func(r rune) rune {
		if r == ' ' {
			return '_'
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			return r
		}
		return -1
	}, s)
}
