-- Add missing columns to manifest_optional_tour for v2 redesign
ALTER TABLE manifest_optional_tour
  ADD COLUMN IF NOT EXISTS tanggal          DATE,
  ADD COLUMN IF NOT EXISTS harga_jual_kurs  NUMERIC(15,2);
-- note: harga_beli_jpy is repurposed as harga_beli_kurs (foreign currency buy price)
-- note: harga_jual_idr already exists
-- note: harga_beli_idr already exists
-- note: kurs already exists
-- note: peserta_ids uuid[] already exists
-- note: tiket_drive_file_id already exists (added in migration 004)
