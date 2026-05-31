package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type OcrResult struct {
	Title         string `json:"title"`
	NamaLengkap   string `json:"nama_lengkap"`
	NoPaspor      string `json:"no_paspor"`
	PlaceOfBirth  string `json:"place_of_birth"`
	TglLahir      string `json:"tgl_lahir"`
	PlaceOfIssued string `json:"place_of_issued"`
	IssuedDate    string `json:"issued_date"`
	ExpiryDate    string `json:"expiry_date"`
}

const ocrPrompt = `Baca informasi paspor dari gambar ini.
Kembalikan HANYA objek JSON berikut, tanpa teks atau markdown lain:
{
  "title": "MR jika Kelamin/Sex adalah L atau M — MRS jika P atau F",
  "nama_lengkap": "dari kolom Nama Lengkap / Full Name",
  "no_paspor": "dari No.Paspor / Passport No",
  "place_of_birth": "dari Tempat Lahir / Place of Birth",
  "tgl_lahir": "dari Tgl.Lahir / Date of Birth — format YYYY-MM-DD",
  "place_of_issued": "dari Kantor yang Mengeluarkan / Issuing Office / Place of Issue",
  "issued_date": "dari Tgl.Pengeluaran / Date of Issue — format YYYY-MM-DD",
  "expiry_date": "dari Tgl.Habis Berlaku / Date of Expiry — format YYYY-MM-DD"
}
Isi semua field yang terbaca. Kembalikan JSON saja.`

func (h *Handler) OcrPaspor(w http.ResponseWriter, r *http.Request) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		log.Println("[OCR] ERROR: ANTHROPIC_API_KEY is not set — add it to backend/.env and restart the server")
		jsonErr(w, 503, "ANTHROPIC_API_KEY not configured — add it to backend/.env and restart")
		return
	}

	if err := r.ParseMultipartForm(15 << 20); err != nil {
		log.Printf("[OCR] ERROR: failed to parse multipart form: %v", err)
		jsonErr(w, 400, "failed to parse form: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("[OCR] ERROR: field 'file' missing: %v", err)
		jsonErr(w, 400, "field 'file' required")
		return
	}
	defer file.Close()

	mimeType := detectMime(header.Header.Get("Content-Type"), header.Filename)
	log.Printf("[OCR] received file: %s | size: %d bytes | mime: %s", header.Filename, header.Size, mimeType)

	if !strings.HasPrefix(mimeType, "image/") {
		log.Printf("[OCR] ERROR: unsupported file type %s", mimeType)
		jsonErr(w, 400, "only image files are supported (jpeg/png/webp), got: "+mimeType)
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		log.Printf("[OCR] ERROR: failed to read file: %v", err)
		jsonErr(w, 500, "failed to read file")
		return
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	log.Printf("[OCR] sending to Anthropic (%d bytes base64)…", len(b64))

	reqBody := map[string]any{
		"model":      "claude-opus-4-8",
		"max_tokens": 512,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{
					"type": "image",
					"source": map[string]any{
						"type":       "base64",
						"media_type": mimeType,
						"data":       b64,
					},
				},
				{"type": "text", "text": ocrPrompt},
			},
		}},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequestWithContext(r.Context(), "POST",
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[OCR] ERROR: anthropic request failed: %v", err)
		jsonErr(w, 502, "anthropic request failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	log.Printf("[OCR] anthropic response status: %d", resp.StatusCode)

	var apiResp struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Error *struct{ Message string `json:"message"` } `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		log.Printf("[OCR] ERROR: failed to parse anthropic response: %v", err)
		jsonErr(w, 502, "failed to parse anthropic response")
		return
	}
	if apiResp.Error != nil {
		log.Printf("[OCR] ERROR: anthropic API error: %s", apiResp.Error.Message)
		jsonErr(w, 502, "anthropic error: "+apiResp.Error.Message)
		return
	}
	if len(apiResp.Content) == 0 {
		log.Println("[OCR] ERROR: empty content in anthropic response")
		jsonErr(w, 502, "empty response from anthropic")
		return
	}

	// Strip markdown code fences if the model adds them
	text := strings.TrimSpace(apiResp.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	log.Printf("[OCR] raw result: %s", text)

	var result OcrResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		log.Printf("[OCR] ERROR: failed to parse OCR JSON: %v | raw: %s", err, text)
		jsonErr(w, 502, "ocr parse error: "+err.Error())
		return
	}

	log.Printf("[OCR] success: title=%s name=%q passport=%s expiry=%s",
		result.Title, result.NamaLengkap, result.NoPaspor, result.ExpiryDate)
	jsonOK(w, result)
}

func detectMime(contentType, filename string) string {
	if contentType != "" && contentType != "application/octet-stream" {
		return contentType
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "image/jpeg"
	}
}
