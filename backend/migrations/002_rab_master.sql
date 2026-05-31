-- migrations/002_rab_master.sql
CREATE TABLE rab_master (
    id          TEXT PRIMARY KEY,
    nama        TEXT NOT NULL,
    jumlah_pax  INT,
    jumlah_hari INT,
    jumlah_malam INT,
    jumlah_tl   INT,
    kurs        NUMERIC(10,4),
    harga_jual  NUMERIC(15,2),
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON rab_master(updated_at DESC);
