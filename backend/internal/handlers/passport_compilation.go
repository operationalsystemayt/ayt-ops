package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"ayt-ops/backend/internal/services"
)

// ── HTTP handler ──────────────────────────────────────────────────────────────

func (h *Handler) PassportCompilation(w http.ResponseWriter, r *http.Request) {
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
		SELECT nama_lengkap, paspor_drive_file_id
		FROM manifest_peserta
		WHERE trip_id = $1::uuid AND paspor_drive_file_id IS NOT NULL
		ORDER BY no_urut`, tripID)
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	defer rows.Close()

	drv, err := services.NewDriveService(ctx)
	if err != nil {
		jsonErr(w, 503, err.Error()); return
	}

	var images []passportImgEntry

	for rows.Next() {
		var nama, fileID string
		if err := rows.Scan(&nama, &fileID); err != nil {
			continue
		}
		log.Printf("[KOMPILASI] downloading paspor for %s (file: %s)", nama, fileID)

		raw, contentType, err := drv.DownloadFile(ctx, fileID)
		if err != nil {
			log.Printf("[KOMPILASI] skip %s — download failed: %v", nama, err)
			continue
		}

		// Detect MIME
		mime := contentType
		if mime == "" || mime == "application/octet-stream" {
			mime = "image/jpeg"
		}

		// AI crop
		cropped, cw, ch, err := cropPassportAI(ctx, raw, mime)
		if err != nil {
			log.Printf("[KOMPILASI] %s — crop failed (%v), using original", nama, err)
			cropped = raw
			if img, _, decErr := image.Decode(bytes.NewReader(raw)); decErr == nil {
				b := img.Bounds()
				cw, ch = b.Dx(), b.Dy()
			}
		}

		log.Printf("[KOMPILASI] %s — cropped %dx%d", nama, cw, ch)
		images = append(images, passportImgEntry{nama: nama, data: cropped, widthPx: cw, heightPx: ch})
	}

	if len(images) == 0 {
		jsonErr(w, 400, "tidak ada foto paspor yang sudah diupload di manifest ini"); return
	}

	docxBytes, err := buildPassportDocx(images, namaTrip, tglBerangkat, tglPulang)
	if err != nil {
		log.Printf("[KOMPILASI] build docx failed: %v", err)
		jsonErr(w, 500, "gagal membuat dokumen: "+err.Error()); return
	}

	// Ensure trip folder → "1. Data Paspor & KTP" → "Paspor"
	folderID, err := h.ensureTripFolder(ctx, drv, tripID)
	if err != nil {
		jsonErr(w, 500, "create trip folder: "+err.Error()); return
	}
	driveFolderID = &folderID
	dokFolder, err := drv.EnsureFolder(ctx, *driveFolderID, "1. Data Paspor & KTP")
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}
	pasporFolder, err := drv.EnsureFolder(ctx, dokFolder, "Paspor")
	if err != nil {
		jsonErr(w, 500, err.Error()); return
	}

	// File name: All_Passpor_{nama}_{periode}.docx
	period := kompilasDateRange(tglBerangkat, tglPulang)
	fileName := fmt.Sprintf("All_Passpor_%s_%s.docx", slugifyName(namaTrip), period)
	mimeDocx := "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

	_, viewURL, err := drv.UploadFile(ctx, pasporFolder, fileName, mimeDocx, bytes.NewReader(docxBytes))
	if err != nil {
		log.Printf("[KOMPILASI] drive upload failed: %v", err)
		jsonErr(w, 500, "drive upload failed: "+err.Error()); return
	}
	log.Printf("[KOMPILASI] uploaded %s (%d images) → %s", fileName, len(images), viewURL)

	jsonOK(w, map[string]any{
		"file_name":      fileName,
		"drive_view_url": viewURL,
		"total_images":   len(images),
	})
}

// ── AI crop ───────────────────────────────────────────────────────────────────

type cropBox struct {
	Top    int `json:"top"`
	Left   int `json:"left"`
	Bottom int `json:"bottom"`
	Right  int `json:"right"`
}

func cropPassportAI(ctx context.Context, imgData []byte, mimeType string) ([]byte, int, int, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, 0, 0, fmt.Errorf("no api key")
	}
	// Only send image/* to Anthropic
	if !strings.HasPrefix(mimeType, "image/") {
		mimeType = "image/jpeg"
	}

	b64 := base64.StdEncoding.EncodeToString(imgData)
	prompt := `Temukan dokumen paspor (halaman data) dalam foto ini.
Kembalikan HANYA JSON berisi persentase yang harus di-crop dari setiap sisi agar hasilnya HANYA menampilkan paspor tanpa background:
{"top":5,"left":5,"bottom":5,"right":5}
Nilai adalah integer 0-50 (persen dari masing-masing sisi yang dihapus). Return JSON only.`

	reqBody := map[string]any{
		"model":      "claude-opus-4-8",
		"max_tokens": 64,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "image", "source": map[string]any{
					"type": "base64", "media_type": mimeType, "data": b64,
				}},
				{"type": "text", "text": prompt},
			},
		}},
	}
	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, 0, err
	}
	defer resp.Body.Close()

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil || len(apiResp.Content) == 0 {
		return nil, 0, 0, fmt.Errorf("bad anthropic response")
	}

	text := strings.TrimSpace(apiResp.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var box cropBox
	if err := json.Unmarshal([]byte(text), &box); err != nil {
		return nil, 0, 0, fmt.Errorf("parse crop box: %w", err)
	}
	// Clamp to 0–40%
	for _, v := range []*int{&box.Top, &box.Left, &box.Bottom, &box.Right} {
		if *v < 0 {
			*v = 0
		}
		if *v > 40 {
			*v = 40
		}
	}
	return cropImage(imgData, box)
}

func cropImage(imgData []byte, box cropBox) ([]byte, int, int, error) {
	img, _, err := image.Decode(bytes.NewReader(imgData))
	if err != nil {
		return imgData, 0, 0, err
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()

	left := w * box.Left / 100
	top := h * box.Top / 100
	right := w - w*box.Right/100
	bottom := h - h*box.Bottom/100

	if right <= left || bottom <= top {
		return imgData, w, h, nil
	}

	cropRect := image.Rect(left, top, right, bottom)
	dst := image.NewRGBA(image.Rect(0, 0, cropRect.Dx(), cropRect.Dy()))
	draw.Draw(dst, dst.Bounds(), img, image.Point{left, top}, draw.Src)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 90}); err != nil {
		return imgData, w, h, err
	}
	return buf.Bytes(), cropRect.Dx(), cropRect.Dy(), nil
}

// ── DOCX builder ─────────────────────────────────────────────────────────────

type passportImgEntry struct {
	nama     string
	data     []byte
	widthPx  int
	heightPx int
}

const targetImgWidthEMU = 3200000 // ~8.47cm per image (2 fit side-by-side on A4)

func buildPassportDocx(images []passportImgEntry, tripName, tglBerangkat, tglPulang string) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// [Content_Types].xml
	writeZipFile(zw, "[Content_Types].xml", contentTypesXML())

	// _rels/.rels
	writeZipFile(zw, "_rels/.rels", relsXML())

	// word/media/imageN.jpeg + collect relationship entries
	var rels []relEntry
	for i, img := range images {
		name := fmt.Sprintf("word/media/image%d.jpeg", i+1)
		writeZipFile(zw, name, img.data)
		rels = append(rels, relEntry{
			id:     fmt.Sprintf("rId%d", i+1),
			target: fmt.Sprintf("media/image%d.jpeg", i+1),
		})
	}

	// word/_rels/document.xml.rels
	writeZipFile(zw, "word/_rels/document.xml.rels", buildDocRelsXML(rels))

	// word/document.xml
	docXML := buildDocumentXML(images)
	writeZipFile(zw, "word/document.xml", []byte(docXML))

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func buildDocumentXML(images []passportImgEntry) string {
	var sb strings.Builder

	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	sb.WriteString(`<w:document`)
	sb.WriteString(` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`)
	sb.WriteString(` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`)
	sb.WriteString(` xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`)
	sb.WriteString(` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`)
	sb.WriteString(` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`)
	sb.WriteString(` xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">`)
	sb.WriteString(`<w:body>`)

	// Page setup
	sb.WriteString(`<w:sectPr>`)
	sb.WriteString(`<w:pgSz w:h="16834" w:w="11909" w:orient="portrait"/>`)
	sb.WriteString(`<w:pgMar w:bottom="523" w:top="567" w:left="1440" w:right="1440" w:header="720" w:footer="720"/>`)
	sb.WriteString(`</w:sectPr>`)

	rIdx := 1 // relationship index
	for i := 0; i < len(images); i += 2 {
		sb.WriteString(`<w:p>`)
		sb.WriteString(`<w:pPr><w:ind w:left="-709" w:right="-749" w:firstLine="0"/></w:pPr>`)

		// First image
		img1 := images[i]
		cx1 := int64(targetImgWidthEMU)
		cy1 := cx1 * int64(img1.heightPx) / int64(max1(img1.widthPx, 1))
		sb.WriteString(imageRunXML(rIdx, i+1, cx1, cy1, img1.nama))
		rIdx++

		// Spacer between images
		sb.WriteString(`<w:r><w:rPr><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">  </w:t></w:r>`)

		// Second image (if exists)
		if i+1 < len(images) {
			img2 := images[i+1]
			cx2 := int64(targetImgWidthEMU)
			cy2 := cx2 * int64(img2.heightPx) / int64(max1(img2.widthPx, 1))
			sb.WriteString(imageRunXML(rIdx, i+2, cx2, cy2, img2.nama))
			rIdx++
		}

		sb.WriteString(`</w:p>`)
	}

	sb.WriteString(`</w:body></w:document>`)
	return sb.String()
}

func imageRunXML(rIdx, docPrID int, cx, cy int64, name string) string {
	return fmt.Sprintf(`<w:r><w:rPr/><w:drawing>`+
		`<wp:inline distB="114300" distT="114300" distL="114300" distR="114300">`+
		`<wp:extent cx="%d" cy="%d"/>`+
		`<wp:effectExtent b="0" l="0" r="0" t="0"/>`+
		`<wp:docPr id="%d" name="%s"/>`+
		`<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`+
		`<pic:pic>`+
		`<pic:nvPicPr><pic:cNvPr id="0" name="%s"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr>`+
		`<pic:blipFill><a:blip r:embed="rId%d"/><a:srcRect b="0" l="0" r="0" t="0"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`+
		`<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"/><a:ln/></pic:spPr>`+
		`</pic:pic>`+
		`</a:graphicData></a:graphic>`+
		`</wp:inline></w:drawing></w:r>`,
		cx, cy, docPrID, name, name, rIdx, cx, cy)
}

func contentTypesXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
		`<Default Extension="xml" ContentType="application/xml"/>` +
		`<Default Extension="jpeg" ContentType="image/jpeg"/>` +
		`<Default Extension="jpg" ContentType="image/jpeg"/>` +
		`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
		`</Types>`)
}

func relsXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
		`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
		`</Relationships>`)
}

type relEntry struct{ id, target string }

func buildDocRelsXML(rels []relEntry) []byte {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	sb.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for _, rel := range rels {
		sb.WriteString(fmt.Sprintf(`<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="%s"/>`,
			rel.id, rel.target))
	}
	sb.WriteString(`</Relationships>`)
	return []byte(sb.String())
}

func writeZipFile(zw *zip.Writer, name string, data []byte) error {
	f, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	return err
}

func kompilasDateRange(start, end string) string {
	s, err1 := time.Parse("2006-01-02", start)
	e, err2 := time.Parse("2006-01-02", end)
	if err1 != nil || err2 != nil {
		return strings.ReplaceAll(start, "-", "") + "-" + strings.ReplaceAll(end, "-", "")
	}
	return fmt.Sprintf("%d%s-%d%s%d",
		s.Day(), s.Format("Jan"),
		e.Day(), e.Format("Jan"),
		e.Year())
}

func max1(a, b int) int {
	if a > b {
		return a
	}
	return b
}
