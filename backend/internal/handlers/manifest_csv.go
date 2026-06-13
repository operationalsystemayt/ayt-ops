package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/go-pdf/fpdf"
	"github.com/xuri/excelize/v2"
	"ayt-ops/backend/internal/services"
)

// manifestCols is the number of columns in the manifest export (CSV/XLSX/PDF).
const manifestCols = 15

// 15-column template matching sample_manifest_master.csv plus Kepala Keluarga + Note.
var emptyManifestRow = make([]string, manifestCols)

type manifestRow struct {
	Seq            int
	Title          string
	Nama           string
	RoomType       string
	Paspor         string
	PlaceOfBirth   string
	Age            string
	TglLahir       string
	PlaceOfIssued  string
	IssuedDate     string
	ExpiryDate     string
	Unit           string
	Klien          string
	KepalaKeluarga string
	Note           string
}

func (h *Handler) fetchManifestRows(ctx context.Context, tripID string) ([]manifestRow, error) {
	rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(title::text,''), nama_lengkap,
		       COALESCE(room_type::text,''), COALESCE(no_paspor,''),
		       COALESCE(place_of_birth,''), COALESCE(tgl_lahir::text,''),
		       COALESCE(place_of_issued,''), COALESCE(issued_date::text,''),
		       COALESCE(expiry_date::text,''), COALESCE(unit::text,''),
		       COALESCE(klien,''), COALESCE(kepala_keluarga,''), COALESCE(note,'')
		FROM manifest_peserta WHERE trip_id = $1::uuid ORDER BY no_urut`, tripID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type raw struct {
		title, nama, roomType, paspor, placeOfBirth, tglLahir,
		placeOfIssued, issuedDate, expiryDate, unit, klien, kk, note string
	}
	var rawRows []raw
	kkCount := map[string]int{}
	for rows.Next() {
		var rr raw
		if err := rows.Scan(&rr.title, &rr.nama, &rr.roomType, &rr.paspor, &rr.placeOfBirth, &rr.tglLahir,
			&rr.placeOfIssued, &rr.issuedDate, &rr.expiryDate, &rr.unit, &rr.klien, &rr.kk, &rr.note); err != nil {
			continue
		}
		if rr.kk != "" {
			kkCount[rr.kk]++
		}
		rawRows = append(rawRows, rr)
	}

	result := make([]manifestRow, 0, len(rawRows))
	for i, rr := range rawRows {
		age := ""
		if rr.tglLahir != "" {
			age = strconv.Itoa(ageFromDateStr(rr.tglLahir))
		}
		kk := rr.kk
		if kk != "" {
			kk = fmt.Sprintf("%s (%d unit)", kk, kkCount[kk])
		}
		result = append(result, manifestRow{
			Seq: i + 1, Title: rr.title, Nama: rr.nama, RoomType: rr.roomType, Paspor: rr.paspor,
			PlaceOfBirth: rr.placeOfBirth, Age: age, TglLahir: fmtDateDMY(rr.tglLahir),
			PlaceOfIssued: rr.placeOfIssued, IssuedDate: fmtDateDMY(rr.issuedDate), ExpiryDate: fmtDateDMY(rr.expiryDate),
			Unit: rr.unit, Klien: rr.klien, KepalaKeluarga: kk, Note: rr.note,
		})
	}
	return result, nil
}

func (h *Handler) ExportManifestToDrive(w http.ResponseWriter, r *http.Request) {
	tripID := chi.URLParam(r, "id")
	ctx := r.Context()

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}

	var namaTrip, tglBerangkat, tglPulang string
	var driveFolderID *string
	err := h.DB.QueryRow(ctx,
		`SELECT nama_trip, tgl_berangkat::text, tgl_pulang::text, drive_folder_id
		 FROM trips WHERE id = $1::uuid AND deleted_at IS NULL`, tripID,
	).Scan(&namaTrip, &tglBerangkat, &tglPulang, &driveFolderID)
	if err != nil {
		jsonErr(w, 404, "trip not found"); return
	}

	manifestRows, err := h.fetchManifestRows(ctx, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	var data []byte
	var mimeType, ext string
	switch format {
	case "xlsx":
		data, err = buildManifestXlsx(manifestRows, namaTrip, tglBerangkat, tglPulang)
		mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		ext = "xlsx"
	case "pdf":
		data, err = buildManifestPdf(manifestRows, namaTrip, tglBerangkat, tglPulang)
		mimeType = "application/pdf"
		ext = "pdf"
	default:
		data, err = buildManifestCsv(manifestRows, namaTrip, tglBerangkat, tglPulang)
		mimeType = "text/csv"
		ext = "csv"
	}
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	// ── Drive upload ──────────────────────────────────────────────────────────
	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error()); return
	}
	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error()); return
	}
	driveFolderID = &folderID

	fileName := fmt.Sprintf("manifest_peserta_%s_%s.%s",
		slugifyName(namaTrip), time.Now().Format("02Jan2006"), ext)
	fileID, viewURL, err := drv.UploadFile(ctx, *driveFolderID, fileName, mimeType, bytes.NewReader(data))
	if err != nil {
		log.Printf("[MANIFEST-%s] upload error: %v", strings.ToUpper(format), err)
		jsonErr(w, 500, "drive upload failed: "+err.Error()); return
	}
	log.Printf("[MANIFEST-%s] uploaded: %s → %s", strings.ToUpper(format), fileName, viewURL)

	jsonOK(w, map[string]string{
		"file_name":      fileName,
		"drive_file_id":  fileID,
		"drive_view_url": viewURL,
	})
}

// ── CSV ───────────────────────────────────────────────────────────────────────

func buildManifestCsv(rows []manifestRow, namaTrip, tglBerangkat, tglPulang string) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM for Excel
	cw := csv.NewWriter(&buf)

	// ── Header block ──────────────────────────────────────────────────────────
	writeRow(cw, "ANGKASA YUDISTIRA TRAVEL")
	writeRow(cw, "NOTE PEMESANAN TIKET - "+strings.ToUpper(namaTrip))
	writeRow(cw, tripDateRange(tglBerangkat, tglPulang))
	cw.Write(emptyManifestRow)

	// Two-row column header
	cw.Write([]string{"NO ", "Title", "NAME", "ROOM TYPE", "PASSPORT NO",
		"BIRTH", "", "", "VALIDITY PASSPOR", "", "", "UNIT", "KLIEN", "KEPALA KELUARGA", "NOTE"})
	cw.Write([]string{"", "", "", "", "",
		"PLACE", "AGE", "DATE", "PLACE OF ISSUED", "ISSUED DATE", "EXPIRY", "", "", "", ""})

	// ── Data rows ─────────────────────────────────────────────────────────────
	for _, rr := range rows {
		cw.Write([]string{
			strconv.Itoa(rr.Seq), rr.Title, rr.Nama, rr.RoomType, rr.Paspor,
			rr.PlaceOfBirth, rr.Age, rr.TglLahir,
			rr.PlaceOfIssued, rr.IssuedDate, rr.ExpiryDate,
			rr.Unit, rr.Klien, rr.KepalaKeluarga, rr.Note,
		})
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	for range 4 {
		cw.Write(emptyManifestRow)
	}
	footer1 := make([]string, manifestCols)
	footer1[1] = "SUDAH PUNYA VISA"
	cw.Write(footer1)
	footer2 := make([]string, manifestCols)
	footer2[1] = "URUS VISA SENDIRI"
	cw.Write(footer2)
	cw.Flush()
	if err := cw.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeRow writes a single value in the first cell, rest empty (manifestCols total).
func writeRow(cw *csv.Writer, val string) {
	row := make([]string, manifestCols)
	row[0] = val
	cw.Write(row)
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

func buildManifestXlsx(rows []manifestRow, namaTrip, tglBerangkat, tglPulang string) ([]byte, error) {
	f := excelize.NewFile()
	sheet := "Manifest"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}

	f.SetCellValue(sheet, "A1", "ANGKASA YUDISTIRA TRAVEL")
	f.SetCellValue(sheet, "A2", "NOTE PEMESANAN TIKET - "+strings.ToUpper(namaTrip))
	f.SetCellValue(sheet, "A3", tripDateRange(tglBerangkat, tglPulang))

	headers1 := []string{"NO", "Title", "NAME", "ROOM TYPE", "PASSPORT NO",
		"BIRTH", "", "", "VALIDITY PASSPOR", "", "", "UNIT", "KLIEN", "KEPALA KELUARGA", "NOTE"}
	headers2 := []string{"", "", "", "", "",
		"PLACE", "AGE", "DATE", "PLACE OF ISSUED", "ISSUED DATE", "EXPIRY", "", "", "", ""}

	const headerRow1, headerRow2 = 5, 6
	for i, val := range headers1 {
		cell, _ := excelize.CoordinatesToCellName(i+1, headerRow1)
		f.SetCellValue(sheet, cell, val)
	}
	for i, val := range headers2 {
		cell, _ := excelize.CoordinatesToCellName(i+1, headerRow2)
		f.SetCellValue(sheet, cell, val)
	}

	startRow := headerRow2 + 1
	for idx, rr := range rows {
		row := startRow + idx
		vals := []interface{}{
			rr.Seq, rr.Title, rr.Nama, rr.RoomType, rr.Paspor,
			rr.PlaceOfBirth, rr.Age, rr.TglLahir,
			rr.PlaceOfIssued, rr.IssuedDate, rr.ExpiryDate,
			rr.Unit, rr.Klien, rr.KepalaKeluarga, rr.Note,
		}
		for i, val := range vals {
			cell, _ := excelize.CoordinatesToCellName(i+1, row)
			f.SetCellValue(sheet, cell, val)
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ── PDF ───────────────────────────────────────────────────────────────────────

var manifestPdfHeaders = []string{"No", "Title", "Nama", "Room", "Paspor", "Tempat Lahir", "Usia", "Tgl Lahir",
	"Kantor Pengeluaran", "Tgl Pengeluaran", "Expiry", "Unit", "Klien", "Kepala Keluarga", "Note"}

var manifestPdfWidths = []float64{8, 10, 30, 12, 20, 22, 8, 18, 22, 18, 18, 8, 15, 24, 24}

func buildManifestPdf(rows []manifestRow, namaTrip, tglBerangkat, tglPulang string) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.AddPage()

	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(0, 7, "ANGKASA YUDISTIRA TRAVEL", "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 10)
	pdf.CellFormat(0, 6, "NOTE PEMESANAN TIKET - "+strings.ToUpper(namaTrip), "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 6, tripDateRange(tglBerangkat, tglPulang), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont("Helvetica", "B", 7)
	pdf.SetFillColor(230, 230, 230)
	for i, hd := range manifestPdfHeaders {
		pdf.CellFormat(manifestPdfWidths[i], 7, hd, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	pdf.SetFont("Helvetica", "", 7)
	for _, rr := range rows {
		vals := []string{
			strconv.Itoa(rr.Seq), rr.Title, rr.Nama, rr.RoomType, rr.Paspor,
			rr.PlaceOfBirth, rr.Age, rr.TglLahir,
			rr.PlaceOfIssued, rr.IssuedDate, rr.ExpiryDate,
			rr.Unit, rr.Klien, rr.KepalaKeluarga, rr.Note,
		}
		for i, val := range vals {
			pdf.CellFormat(manifestPdfWidths[i], 6, val, "1", 0, "L", false, 0, "")
		}
		pdf.Ln(-1)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
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
