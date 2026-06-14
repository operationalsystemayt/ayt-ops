-- migrations/013_manifest_peserta_notelp.sql
ALTER TABLE manifest_peserta
  ADD COLUMN IF NOT EXISTS no_telp TEXT;
