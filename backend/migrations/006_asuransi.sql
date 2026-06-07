CREATE TABLE IF NOT EXISTS trip_asuransi (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    nama_polis        TEXT,
    kode_booking      TEXT,
    nama_pemegang     TEXT,
    periode_mulai     DATE,
    periode_selesai   DATE,
    file_name         TEXT,
    drive_file_id     TEXT,
    drive_view_url    TEXT,
    mime_type         TEXT,
    peserta_ids       UUID[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trip_asuransi_trip_id_idx ON trip_asuransi(trip_id);
