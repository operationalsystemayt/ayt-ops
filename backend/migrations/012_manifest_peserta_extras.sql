-- migrations/012_manifest_peserta_extras.sql
ALTER TABLE manifest_peserta
  ADD COLUMN IF NOT EXISTS kepala_keluarga TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;
