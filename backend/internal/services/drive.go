// Pure stdlib Google Drive service — no external dependencies.
// Supports two auth modes (auto-detected from env):
//   Mode A (service account): GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_DRIVE_ROOT_FOLDER_ID
//   Mode B (OAuth2 personal): GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET +
//                              GOOGLE_OAUTH_REFRESH_TOKEN + GOOGLE_DRIVE_ROOT_FOLDER_ID
package services

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"sync"
	"time"
)

var ErrDriveNotConfigured = errors.New(
	"Google Drive not configured — run `go run ./cmd/setup-drive-auth` to set up OAuth2, " +
		"or set GOOGLE_APPLICATION_CREDENTIALS with a Shared Drive")

const driveScope = "https://www.googleapis.com/auth/drive"

type DriveService struct {
	// Service account (Mode A)
	clientEmail string
	privateKey  *rsa.PrivateKey

	// OAuth2 refresh token (Mode B)
	oauthClientID     string
	oauthClientSecret string
	oauthRefreshToken string

	RootFolderID string

	mu          sync.Mutex
	tokenCache  string
	tokenExpiry time.Time
}

// AuthMode returns a human-readable description of the active auth mode.
func (d *DriveService) AuthMode() string {
	if d.privateKey != nil {
		return "service account (" + d.clientEmail + ")"
	}
	return "OAuth2 personal account"
}

// NewDriveService auto-detects the auth mode from environment variables.
func NewDriveService(_ context.Context) (*DriveService, error) {
	rootID := os.Getenv("GOOGLE_DRIVE_ROOT_FOLDER_ID")

	// Mode B — OAuth2 refresh token (works with personal Google accounts)
	clientID := os.Getenv("GOOGLE_OAUTH_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")
	refreshToken := os.Getenv("GOOGLE_OAUTH_REFRESH_TOKEN")
	if clientID != "" && clientSecret != "" && refreshToken != "" {
		if rootID == "" {
			return nil, errors.New("GOOGLE_DRIVE_ROOT_FOLDER_ID not set")
		}
		return &DriveService{
			oauthClientID:     clientID,
			oauthClientSecret: clientSecret,
			oauthRefreshToken: refreshToken,
			RootFolderID:      rootID,
		}, nil
	}

	// Mode A — service account (requires Shared Drive or Google Workspace)
	credFile := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	if credFile == "" || rootID == "" {
		return nil, ErrDriveNotConfigured
	}
	raw, err := os.ReadFile(credFile)
	if err != nil {
		return nil, fmt.Errorf("read credentials file: %w", err)
	}
	var creds struct {
		ClientEmail string `json:"client_email"`
		PrivateKey  string `json:"private_key"`
	}
	if err := json.Unmarshal(raw, &creds); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}
	key, err := parseRSAKey(creds.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	return &DriveService{
		clientEmail:  creds.ClientEmail,
		privateKey:   key,
		RootFolderID: rootID,
	}, nil
}

// ServiceAccountEmail returns the service account email (Mode A only).
func (d *DriveService) ServiceAccountEmail() string { return d.clientEmail }

// ── token ─────────────────────────────────────────────────────────────────────

func (d *DriveService) token(ctx context.Context) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.tokenCache != "" && time.Now().Before(d.tokenExpiry) {
		return d.tokenCache, nil
	}
	if d.privateKey != nil {
		return d.serviceAccountToken()
	}
	return d.oauthToken()
}

func (d *DriveService) oauthToken() (string, error) {
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"client_id":     {d.oauthClientID},
		"client_secret": {d.oauthClientSecret},
		"refresh_token": {d.oauthRefreshToken},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return "", fmt.Errorf("oauth token request: %w", err)
	}
	defer resp.Body.Close()
	var t struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return "", fmt.Errorf("decode oauth token: %w", err)
	}
	if t.Error != "" {
		return "", fmt.Errorf("oauth error: %s — %s", t.Error, t.ErrorDesc)
	}
	d.tokenCache = t.AccessToken
	d.tokenExpiry = time.Now().Add(time.Duration(t.ExpiresIn-60) * time.Second)
	return d.tokenCache, nil
}

func (d *DriveService) serviceAccountToken() (string, error) {
	now := time.Now().Unix()
	hdr := b64j(map[string]string{"alg": "RS256", "typ": "JWT"})
	clm := b64j(map[string]any{
		"iss":   d.clientEmail,
		"scope": driveScope,
		"aud":   "https://oauth2.googleapis.com/token",
		"iat":   now,
		"exp":   now + 3600,
	})
	signing := hdr + "." + clm
	h := sha256.New()
	h.Write([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, d.privateKey, crypto.SHA256, h.Sum(nil))
	if err != nil {
		return "", fmt.Errorf("sign jwt: %w", err)
	}
	jwt := signing + "." + base64.RawURLEncoding.EncodeToString(sig)

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {jwt},
	})
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()
	var t struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}
	if t.Error != "" {
		return "", fmt.Errorf("service account token error: %s", t.Error)
	}
	d.tokenCache = t.AccessToken
	d.tokenExpiry = time.Now().Add(time.Duration(t.ExpiresIn-60) * time.Second)
	return d.tokenCache, nil
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func (d *DriveService) do(ctx context.Context, method, endpoint string, body io.Reader, ct string) (*http.Response, error) {
	tok, err := d.token(ctx)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://www.googleapis.com"+endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	if ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	return http.DefaultClient.Do(req)
}

func (d *DriveService) doJSON(ctx context.Context, method, endpoint string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		body = bytes.NewReader(b)
	}
	resp, err := d.do(ctx, method, endpoint, body, "application/json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &apiErr) == nil && apiErr.Error.Message != "" {
			return fmt.Errorf("drive %d: %s", resp.StatusCode, apiErr.Error.Message)
		}
		return fmt.Errorf("drive %d: %s", resp.StatusCode, string(raw))
	}

	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// ── public API ────────────────────────────────────────────────────────────────

func (d *DriveService) EnsureFolder(ctx context.Context, parentID, name string) (string, error) {
	q := url.QueryEscape(fmt.Sprintf(
		"'%s' in parents and name='%s' and mimeType='application/vnd.google-apps.folder' and trashed=false",
		parentID, name))
	var list struct {
		Files []struct{ ID string `json:"id"` } `json:"files"`
	}
	if err := d.doJSON(ctx, "GET",
		"/drive/v3/files?q="+q+"&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true",
		nil, &list); err != nil {
		return "", fmt.Errorf("list folders: %w", err)
	}
	if len(list.Files) > 0 {
		return list.Files[0].ID, nil
	}

	var created struct{ ID string `json:"id"` }
	if err := d.doJSON(ctx, "POST", "/drive/v3/files?fields=id&supportsAllDrives=true", map[string]any{
		"name":     name,
		"mimeType": "application/vnd.google-apps.folder",
		"parents":  []string{parentID},
	}, &created); err != nil {
		return "", fmt.Errorf("create folder %q: %w", name, err)
	}
	return created.ID, nil
}

func (d *DriveService) UploadFile(ctx context.Context, folderID, fileName, mimeType string, data io.Reader) (string, string, error) {
	fileBytes, err := io.ReadAll(data)
	if err != nil {
		return "", "", fmt.Errorf("read file: %w", err)
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	metaHdr := make(textproto.MIMEHeader)
	metaHdr.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, _ := mw.CreatePart(metaHdr)
	json.NewEncoder(metaPart).Encode(map[string]any{
		"name":    fileName,
		"parents": []string{folderID},
	})

	fileHdr := make(textproto.MIMEHeader)
	fileHdr.Set("Content-Type", mimeType)
	filePart, _ := mw.CreatePart(fileHdr)
	filePart.Write(fileBytes)
	mw.Close()

	tok, err := d.token(ctx)
	if err != nil {
		return "", "", err
	}
	req, _ := http.NewRequestWithContext(ctx, "POST",
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true",
		&buf)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "multipart/related; boundary="+mw.Boundary())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("upload: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &apiErr) == nil && apiErr.Error.Message != "" {
			return "", "", fmt.Errorf("drive upload %d: %s", resp.StatusCode, apiErr.Error.Message)
		}
		return "", "", fmt.Errorf("drive upload %d: %s", resp.StatusCode, string(raw))
	}

	var created struct{ ID string `json:"id"` }
	if err := json.Unmarshal(raw, &created); err != nil || created.ID == "" {
		return "", "", fmt.Errorf("upload ok but no file ID returned: %s", string(raw))
	}

	// Make publicly viewable — best-effort
	_ = d.doJSON(ctx, "POST",
		fmt.Sprintf("/drive/v3/files/%s/permissions?supportsAllDrives=true", created.ID),
		map[string]string{"type": "anyone", "role": "reader"}, nil)

	return created.ID,
		fmt.Sprintf("https://drive.google.com/file/d/%s/view", created.ID),
		nil
}

func (d *DriveService) DeleteFile(ctx context.Context, fileID string) error {
	resp, err := d.do(ctx, "DELETE", "/drive/v3/files/"+fileID+"?supportsAllDrives=true", nil, "")
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseRSAKey(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("not an RSA key")
		}
		return rk, nil
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func b64j(v any) string {
	b, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(b)
}
