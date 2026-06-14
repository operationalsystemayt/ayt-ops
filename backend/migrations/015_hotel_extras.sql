-- migrations/015_hotel_extras.sql
ALTER TABLE manifest_hotel
  ADD COLUMN IF NOT EXISTS voucher_atas_nama TEXT,
  ADD COLUMN IF NOT EXISTS metode_pembayaran TEXT,
  ADD COLUMN IF NOT EXISTS harga_realisasi NUMERIC(15,2);
