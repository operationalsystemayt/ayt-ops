// One-time Google Drive OAuth2 setup.
// Run: go run ./cmd/setup-drive-auth
// Then paste the printed values into backend/.env
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const redirectURI = "http://localhost:8090"

func main() {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("────────────────────────────────────────────────────────")
	fmt.Println("  Google Drive OAuth2 Setup for AYT Ops")
	fmt.Println("────────────────────────────────────────────────────────")
	fmt.Println()
	fmt.Println("Pre-requisites (do these first in Google Cloud Console):")
	fmt.Println("  1. Go to console.cloud.google.com → your project")
	fmt.Println("  2. APIs & Services → Credentials → Create Credentials")
	fmt.Println("     → OAuth client ID → Desktop app → name: ayt-ops")
	fmt.Println("  3. Copy the Client ID and Client Secret shown below")
	fmt.Println()

	clientID := strings.TrimSpace(prompt(reader, "Paste OAuth Client ID    : "))
	clientSecret := strings.TrimSpace(prompt(reader, "Paste OAuth Client Secret: "))

	if clientID == "" || clientSecret == "" {
		fmt.Println("ERROR: client ID and secret are required")
		os.Exit(1)
	}

	// Build authorization URL
	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
		"scope":         {"https://www.googleapis.com/auth/drive"},
		"access_type":   {"offline"},
		"prompt":        {"consent"}, // force refresh_token in response
	}
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()

	// Start local callback server
	codeCh := make(chan string, 1)
	srv := &http.Server{Addr: ":8090"}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		if code == "" {
			fmt.Fprintf(w, "<h2>No code received — try again.</h2>")
			return
		}
		fmt.Fprintf(w, "<h2>✓ Authorization successful — you can close this tab.</h2>")
		codeCh <- code
	})

	// Check port is free
	if ln, err := net.Listen("tcp", ":8090"); err != nil {
		fmt.Printf("ERROR: port 8090 is in use: %v\n", err)
		os.Exit(1)
	} else {
		ln.Close()
	}

	go srv.ListenAndServe()
	defer srv.Shutdown(context.Background())

	fmt.Println()
	fmt.Println("Opening browser for Google authorization…")
	openBrowser(authURL)
	fmt.Println("If the browser didn't open, paste this URL manually:")
	fmt.Println(authURL)
	fmt.Println()
	fmt.Println("Waiting for authorization (timeout 2 min)…")

	var code string
	select {
	case code = <-codeCh:
	case <-time.After(2 * time.Minute):
		fmt.Println("ERROR: timed out waiting for authorization")
		os.Exit(1)
	}

	// Exchange code for tokens
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		fmt.Printf("ERROR exchanging code: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
		ErrorDesc    string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		fmt.Printf("ERROR parsing token response: %v\n", err)
		os.Exit(1)
	}
	if tokens.Error != "" {
		fmt.Printf("ERROR from Google: %s — %s\n", tokens.Error, tokens.ErrorDesc)
		os.Exit(1)
	}
	if tokens.RefreshToken == "" {
		fmt.Println("ERROR: no refresh_token in response.")
		fmt.Println("Go to https://myaccount.google.com/permissions, revoke AYT Ops, then run this script again.")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("────────────────────────────────────────────────────────")
	fmt.Println("  SUCCESS — add these lines to backend/.env:")
	fmt.Println("────────────────────────────────────────────────────────")
	fmt.Printf("\nGOOGLE_OAUTH_CLIENT_ID=%s\n", clientID)
	fmt.Printf("GOOGLE_OAUTH_CLIENT_SECRET=%s\n", clientSecret)
	fmt.Printf("GOOGLE_OAUTH_REFRESH_TOKEN=%s\n", tokens.RefreshToken)
	fmt.Println()
	fmt.Println("Then restart: go run main.go")
}

func prompt(r *bufio.Reader, label string) string {
	fmt.Print(label)
	s, _ := r.ReadString('\n')
	return strings.TrimRight(s, "\r\n")
}

func openBrowser(u string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", u)
	case "linux":
		cmd = exec.Command("xdg-open", u)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	}
	if cmd != nil {
		cmd.Start()
	}
}
