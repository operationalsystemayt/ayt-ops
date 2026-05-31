# AYT Ops

Internal ops tool for AYT — covers RAB (budget planning) and Open Trip management.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind |
| Backend (Trip) | Go 1.22 + chi router + pgx |
| Database | PostgreSQL 16 |
| Storage (RAB) | localStorage → Supabase (Phase 2) |

---

## Prerequisites

| Tool | Install |
|---|---|
| Node.js 20+ | `brew install node` |
| Go 1.22+ | `brew install go` |
| Docker Desktop | [docker.com/get-started](https://www.docker.com/get-started/) |

---

## Local Setup

### 1. Clone & install frontend deps

```bash
git clone https://github.com/operationalsystemayt/ayt-ops.git
cd ayt-ops
npm install
```

### 2. Configure environment

```bash
cp .env.local .env.local   # already exists — no action needed locally
```

Key variable already set in `.env.local`:

```
NEXT_PUBLIC_TRIP_API_URL=http://localhost:8080
NEXT_PUBLIC_STORAGE_BACKEND=local
```

---

## Running the App

You need **3 terminals** running simultaneously.

### Terminal 1 — PostgreSQL (Docker)

```bash
cd backend
docker-compose up db -d
```

Postgres starts on port `5432`. On first run it automatically executes `migrations/001_init.sql` and creates all tables.

To check it's up:
```bash
docker-compose ps
```

### Terminal 2 — Go backend (Trip API)

```bash
cd backend
cp .env.example .env      # copy default config (localhost, no changes needed)
go run main.go
```

Expected output:
```
connected to database
server running on http://localhost:8080
```

Verify the backend is healthy:
```bash
curl http://localhost:8080/health
# → {"ok":true}
```

### Terminal 3 — Next.js frontend

```bash
# from the project root
npm run dev
```

Open **http://localhost:3000**

---

## Testing the Flow

### RAB (Budget Planner) — `/rab`

1. Go to http://localhost:3000 → click **RAB**
2. Click **+ Buat RAB** → fill in trip name, kurs, pax, hari, malam
3. Add rows in Budget Peserta and Budget TL
   - Pick a **Kalkulasi** (÷ pax, × hari, Custom…)
   - For Custom: select `Custom…` then type a formula like `biaya*2/5`
   - Toggle **×kurs** chip on each row to include/exclude kurs
4. Drag the **Detail Kegiatan** column header edge to resize it
5. Fill in Harga Jual → check Laba/pax auto-calculates
6. Add optional **Catatan** at the bottom
7. Click **↓ Export CSV** → download spreadsheet
8. Click **Simpan RAB** → saved to localStorage

### Open Trip — `/trip`

#### Create a trip

1. Go to http://localhost:3000 → click **Open Trip**
2. Click **+ Buat Trip**
3. Fill in:
   - Nama Open Trip: `JPN Winter Golden Route 6D5N`
   - Tanggal Berangkat: pick a date
   - Jumlah Hari: `6` (tgl pulang auto-calculates)
   - Total Pax: `16`
4. Click **Simpan Trip** → redirects to `/trip/[id]`

#### Tab 2a — Manifest Inti

1. Click **+ Tambah**
2. Fill in: Title `MR`, Nama `JOHN DOE`, No Paspor `A1234567`, Tgl Lahir, Expiry, Room `DOUBLE`, Meals `NON_MUSLIM`
3. Click **Simpan** → row appears in table
4. Hover the row → click **edit** to update, **hapus** to delete
5. Check the status column: `✓ Valid` / `⚠ Belum paspor` / `✗ Expired` computed automatically

#### Tab 2g — Payment

1. Click **+ Tambah**
2. Select Peserta from dropdown, Jenis `dp`, Amount, Tanggal
3. Click **Simpan** → total at top updates
4. Hover row → click **hapus** to delete

#### Tab 2h — Notes

1. Type a note in the textarea → click **Tambah Catatan**
2. Note appears with timestamp
3. Click **edit** → update inline → **Simpan**
4. Click **hapus** → deleted immediately (no confirm dialog)

#### Dashboard reminders

Payment schedules with deadline ≤ 4 days show in the **Payment Deadline** panel on the right side of `/trip`. Badges show `H-4` / `H-3` / `H-2` / `HARI INI`.

---

## API Reference (Go backend)

Base URL: `http://localhost:8080`

```
GET    /health
GET    /api/trips                    list trips (?status=draft|confirmed|ongoing|done|cancelled)
POST   /api/trips                    create trip
GET    /api/trips/:id                get trip
PUT    /api/trips/:id                update trip
DELETE /api/trips/:id                soft delete

GET    /api/trips/:id/peserta        list manifest peserta
POST   /api/trips/:id/peserta        add peserta
PUT    /api/trips/:id/peserta/:pid   update peserta
DELETE /api/trips/:id/peserta/:pid   delete peserta

GET    /api/trips/:id/payments       list payments
POST   /api/trips/:id/payments       add payment
DELETE /api/trips/:id/payments/:pay  delete payment

GET    /api/trips/:id/notes          list notes
POST   /api/trips/:id/notes          add note
PUT    /api/trips/:id/notes/:nid     update note
DELETE /api/trips/:id/notes/:nid     delete note

GET    /api/trips/:id/laba           compute laba aktual vs RAB
GET    /api/reminders/upcoming       payment deadlines ≤ 4 days
```

Quick test with curl:

```bash
# Create a trip
curl -s -X POST http://localhost:8080/api/trips \
  -H "Content-Type: application/json" \
  -d '{"nama_trip":"Test Trip","tgl_berangkat":"2025-06-01","tgl_pulang":"2025-06-06","total_pax":16}' | jq

# Add a peserta (replace TRIP_ID)
curl -s -X POST http://localhost:8080/api/trips/TRIP_ID/peserta \
  -H "Content-Type: application/json" \
  -d '{"nama_lengkap":"JOHN DOE","title":"MR","no_paspor":"A1234567"}' | jq

# Add a payment
curl -s -X POST http://localhost:8080/api/trips/TRIP_ID/payments \
  -H "Content-Type: application/json" \
  -d '{"jenis":"dp","amount":5000000,"tgl_bayar":"2025-06-01"}' | jq

# Compute laba
curl -s http://localhost:8080/api/trips/TRIP_ID/laba | jq
```

---

## Stopping Everything

```bash
# Stop frontend: Ctrl+C in terminal 3
# Stop Go backend: Ctrl+C in terminal 2
# Stop + remove DB container:
cd backend && docker-compose down
# Stop but keep data:
cd backend && docker-compose stop db
```

To wipe the database and start fresh:
```bash
cd backend && docker-compose down -v   # -v removes the volume
docker-compose up db -d
```

---

## Feature Status

| Feature | Status |
|---|---|
| RAB — budget planner | ✅ Done |
| RAB — resizable columns | ✅ Done |
| RAB — custom kalkulasi formula | ✅ Done |
| RAB — ×kurs toggle per row | ✅ Done |
| RAB — catatan | ✅ Done |
| RAB — export CSV | ✅ Done |
| Trip — dashboard + reminders | ✅ Done |
| Trip — create trip | ✅ Done |
| Trip — manifest inti (2a) | ✅ Done |
| Trip — payment (2g) | ✅ Done |
| Trip — notes (2h) | ✅ Done |
| Trip — keberangkatan (2b) | 🚧 API ready, UI pending |
| Trip — room hotel (2c) | 🚧 API ready, UI pending |
| Trip — transportasi (2d) | 🚧 API ready, UI pending |
| Trip — optional tour (2e) | 🚧 API ready, UI pending |
| Trip — visa (2f) | 🚧 API ready, UI pending |
| Google Drive integration | 📋 Phase 2 |
| Passport OCR (Anthropic) | 📋 Phase 2 |
| WhatsApp/email reminders | 📋 Phase 2 |
| Supabase backend (RAB) | 📋 Phase 2 |
