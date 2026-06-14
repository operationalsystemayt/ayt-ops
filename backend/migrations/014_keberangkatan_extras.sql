-- migrations/014_keberangkatan_extras.sql
ALTER TABLE manifest_keberangkatan
  ADD COLUMN IF NOT EXISTS terminal TEXT,
  ADD COLUMN IF NOT EXISTS transit_berangkat TEXT,
  ADD COLUMN IF NOT EXISTS transit_pulang TEXT,
  ADD COLUMN IF NOT EXISTS bagasi_checkin_berangkat_kg NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bagasi_checkin_pulang_kg NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS harga_tiket_berangkat NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS harga_tiket_pulang NUMERIC(15,2);
