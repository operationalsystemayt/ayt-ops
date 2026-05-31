-- migrations/001_init.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE trip_status       AS ENUM ('draft','confirmed','ongoing','done','cancelled');
CREATE TYPE peserta_title     AS ENUM ('MR','MRS','MS','MISS','MASTER','TOUR_LEADER');
CREATE TYPE room_type         AS ENUM ('DOUBLE','TWIN','SINGLE','TRIPLE');
CREATE TYPE meal_type         AS ENUM ('MUSLIM','NON_MUSLIM');
CREATE TYPE visa_status_type  AS ENUM ('not_required','pending','uploaded','approved','rejected');
CREATE TYPE payment_jenis     AS ENUM ('dp','pelunasan','lainnya');
CREATE TYPE schedule_jenis    AS ENUM ('TIKET','HOTEL','TRANSPORTASI','LAINNYA');
CREATE TYPE schedule_status   AS ENUM ('pending','paid','reminded');
CREATE TYPE transport_jenis   AS ENUM ('SHINKANSEN','LOKAL');
CREATE TYPE realisasi_tipe    AS ENUM ('pemasukan','pengeluaran');

-- ── trips ──────────────────────────────────────────────────────────────────────
CREATE TABLE trips (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_trip             TEXT NOT NULL,
    rab_master_id         TEXT,
    tgl_berangkat         DATE NOT NULL,
    tgl_pulang            DATE NOT NULL,
    total_pax             INT  NOT NULL DEFAULT 0,
    status                trip_status NOT NULL DEFAULT 'draft',
    drive_folder_id       TEXT,
    manifest_csv_drive_id TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);
CREATE INDEX ON trips(tgl_berangkat);
CREATE INDEX ON trips(status) WHERE deleted_at IS NULL;

-- ── manifest_peserta ───────────────────────────────────────────────────────────
CREATE TABLE manifest_peserta (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    no_urut               INT  NOT NULL DEFAULT 0,
    title                 peserta_title,
    nama_lengkap          TEXT NOT NULL,
    no_paspor             TEXT,
    place_of_birth        TEXT,
    tgl_lahir             DATE,
    place_of_issued       TEXT,
    issued_date           DATE,
    expiry_date           DATE,
    room_type             room_type,
    unit                  INT,
    klien                 TEXT,
    meals                 meal_type,
    paspor_drive_file_id  TEXT,
    ktp_drive_file_id     TEXT,
    visa_drive_file_id    TEXT,
    visa_status           visa_status_type NOT NULL DEFAULT 'not_required',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON manifest_peserta(trip_id);

-- ── payment_schedules ──────────────────────────────────────────────────────────
CREATE TABLE payment_schedules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    jenis            schedule_jenis NOT NULL,
    deskripsi        TEXT,
    deadline         DATE NOT NULL,
    amount           NUMERIC(15,2),
    status           schedule_status NOT NULL DEFAULT 'pending',
    reminder_sent_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON payment_schedules(deadline) WHERE status = 'pending';

-- ── manifest_keberangkatan ─────────────────────────────────────────────────────
CREATE TABLE manifest_keberangkatan (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id              UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    peserta_id           UUID REFERENCES manifest_peserta(id),
    tgl_pemesanan        DATE,
    pemesanan            TEXT,
    agent                TEXT,
    harga_tiket          NUMERIC(15,2),
    kode_booking         TEXT,
    no_etiket            TEXT,
    maskapai             TEXT,
    rute_berangkat       TEXT,
    tgl_berangkat_flight DATE,
    jam_berangkat        TIME,
    rute_pulang          TEXT,
    tgl_pulang_flight    DATE,
    jam_pulang           TIME,
    bagasi_kabin_kg      NUMERIC(5,2),
    bagasi_checkin_kg    NUMERIC(5,2),
    unit                 INT,
    klien                TEXT,
    meals                meal_type,
    tiket_drive_file_id  TEXT,
    payment_schedule_id  UUID REFERENCES payment_schedules(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── manifest_hotel ─────────────────────────────────────────────────────────────
CREATE TABLE manifest_hotel (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    rute                TEXT,
    nama_hotel          TEXT,
    nama_agent          TEXT,
    confirmation_number TEXT,
    tgl_stay_mulai      DATE,
    tgl_stay_selesai    DATE,
    jumlah_room         INT,
    tipe_room           room_type,
    jumlah_malam        INT,
    harga_jpy           NUMERIC(15,2),
    harga_idr           NUMERIC(15,2),
    total_idr           NUMERIC(15,2),
    kurs                NUMERIC(10,4),
    peserta_ids         UUID[],
    nota_drive_file_id  TEXT,
    payment_schedule_id UUID REFERENCES payment_schedules(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── manifest_transportasi ──────────────────────────────────────────────────────
CREATE TABLE manifest_transportasi (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    jenis               transport_jenis NOT NULL DEFAULT 'LOKAL',
    vendor              TEXT,
    tgl_trip            DATE,
    tipe_kendaraan      TEXT,
    keterangan_rute     TEXT,
    qty                 INT,
    kategori_usia       TEXT,
    harga_jpy           NUMERIC(15,2),
    harga_idr           NUMERIC(15,2),
    total_idr           NUMERIC(15,2),
    kurs                NUMERIC(10,4),
    nota_drive_file_id  TEXT,
    payment_schedule_id UUID REFERENCES payment_schedules(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── manifest_optional_tour ────────────────────────────────────────────────────
CREATE TABLE manifest_optional_tour (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    nama_tour        TEXT NOT NULL,
    kategori         TEXT,
    tier             TEXT,
    harga_jual_idr   NUMERIC(15,2),
    harga_beli_jpy   NUMERIC(15,2),
    harga_beli_idr   NUMERIC(15,2),
    kurs             NUMERIC(10,4),
    peserta_ids      UUID[],
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── trip_payments ─────────────────────────────────────────────────────────────
CREATE TABLE trip_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    peserta_id          UUID REFERENCES manifest_peserta(id),
    jenis               payment_jenis NOT NULL DEFAULT 'dp',
    amount              NUMERIC(15,2) NOT NULL,
    tgl_bayar           DATE NOT NULL,
    bukti_drive_file_id TEXT,
    catatan             TEXT,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON trip_payments(trip_id);

-- ── trip_notes ────────────────────────────────────────────────────────────────
CREATE TABLE trip_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON trip_notes(trip_id);

-- ── realisasi_items ───────────────────────────────────────────────────────────
CREATE TABLE realisasi_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kategori   TEXT NOT NULL,
    deskripsi  TEXT,
    amount     NUMERIC(15,2) NOT NULL,
    tipe       realisasi_tipe NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
