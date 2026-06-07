CREATE TABLE IF NOT EXISTS trip_itinerary (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    file_name     TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    drive_view_url TEXT,
    mime_type     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trip_itinerary_trip_id_idx ON trip_itinerary(trip_id);
