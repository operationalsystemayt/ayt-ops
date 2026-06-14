-- migrations/016_transportasi_kurs.sql
ALTER TYPE transport_jenis ADD VALUE IF NOT EXISTS 'ICOCA_SUICA';

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS transportasi_kurs_list JSONB NOT NULL DEFAULT '[]';

ALTER TABLE manifest_transportasi
  ADD COLUMN IF NOT EXISTS kurs_id TEXT,
  ADD COLUMN IF NOT EXISTS kurs_label TEXT;
