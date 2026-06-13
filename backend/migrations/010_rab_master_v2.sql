-- migrations/010_rab_master_v2.sql
ALTER TABLE rab_master
  ADD COLUMN IF NOT EXISTS jumlah_guide INT,
  ADD COLUMN IF NOT EXISTS jumlah_driver INT;
