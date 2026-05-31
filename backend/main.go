package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"

	"ayt-ops/backend/internal/db"
	"ayt-ops/backend/internal/router"
)

func main() {
	// Try to load .env from the directory where the binary is run
	envPath, _ := filepath.Abs(".env")
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("WARN .env not loaded (%s): %v", envPath, err)
		log.Println("WARN using shell environment variables only")
	} else {
		log.Printf("INFO loaded %s", envPath)
	}

	// Feature availability check at startup
	log.Println("── feature status ──────────────────────────")
	if v := os.Getenv("ANTHROPIC_API_KEY"); v != "" {
		log.Printf("✓ Anthropic OCR      : configured (key: %s...)", v[:min(8, len(v))])
	} else {
		log.Println("✗ Anthropic OCR      : ANTHROPIC_API_KEY not set — OCR disabled")
	}
	rootID := os.Getenv("GOOGLE_DRIVE_ROOT_FOLDER_ID")
	oauthReady := os.Getenv("GOOGLE_OAUTH_CLIENT_ID") != "" &&
		os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET") != "" &&
		os.Getenv("GOOGLE_OAUTH_REFRESH_TOKEN") != ""
	saReady := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") != "" && rootID != ""
	if rootID != "" && (oauthReady || saReady) {
		log.Printf("✓ Google Drive       : configured (root folder: %s)", rootID)
		if oauthReady {
			log.Println("  ↳ auth mode        : OAuth2 personal account")
		} else {
			email := readServiceAccountEmail(os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"))
			log.Println("  ↳ auth mode        : service account")
			if email != "" {
				log.Printf("  ↳ service account  : %s", email)
			}
		}
	} else {
		log.Println("✗ Google Drive       : not configured — run: go run ./cmd/setup-drive-auth")
	}
	if v := os.Getenv("NEXT_PUBLIC_STORAGE_BACKEND"); v == "supabase" {
		log.Println("✓ Storage backend    : supabase")
	} else {
		log.Println("  Storage backend    : local (localStorage)")
	}
	log.Println("────────────────────────────────────────────")

	ctx := context.Background()
	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("ERROR cannot connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ERROR database ping failed: %v", err)
	}
	log.Println("✓ Database           : connected")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("✓ Server             : http://localhost:%s", port)
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router.New(pool),
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func readServiceAccountEmail(credFile string) string {
	data, err := os.ReadFile(credFile)
	if err != nil {
		return ""
	}
	var creds struct {
		ClientEmail string `json:"client_email"`
	}
	if err := json.Unmarshal(data, &creds); err != nil {
		return ""
	}
	return creds.ClientEmail
}
