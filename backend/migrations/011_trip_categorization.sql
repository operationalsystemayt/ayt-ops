-- migrations/011_trip_categorization.sql
CREATE TYPE trip_category_type AS ENUM ('domestik', 'internasional');
CREATE TYPE trip_type_type AS ENUM ('open_trip', 'private_trip');

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS jumlah_malam INT,
  ADD COLUMN IF NOT EXISTS trip_category trip_category_type NOT NULL DEFAULT 'domestik',
  ADD COLUMN IF NOT EXISTS negara TEXT,
  ADD COLUMN IF NOT EXISTS trip_type trip_type_type NOT NULL DEFAULT 'open_trip';
