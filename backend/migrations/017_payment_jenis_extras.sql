-- migrations/017_payment_jenis_extras.sql
ALTER TYPE payment_jenis ADD VALUE IF NOT EXISTS 'harga_paket';
ALTER TYPE payment_jenis ADD VALUE IF NOT EXISTS 'tipping';
ALTER TYPE payment_jenis ADD VALUE IF NOT EXISTS 'harga_visa';
ALTER TYPE payment_jenis ADD VALUE IF NOT EXISTS 'optional_tour';
ALTER TYPE payment_jenis ADD VALUE IF NOT EXISTS 'diskon';

ALTER TABLE trip_payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
