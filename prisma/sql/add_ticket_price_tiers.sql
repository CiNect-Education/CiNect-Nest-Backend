-- Safe additive migration: cinema detail ticket price table (Cinestar-style)
CREATE TABLE IF NOT EXISTS ticket_price_tiers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cinema_id TEXT REFERENCES cinemas(id) ON DELETE CASCADE,
  format room_format NOT NULL,
  category_key VARCHAR(64) NOT NULL,
  slot_primary VARCHAR(255) NOT NULL,
  slot_secondary VARCHAR(255),
  subtitle VARCHAR(255),
  adult_price DECIMAL(12, 2) NOT NULL,
  concession_price DECIMAL(12, 2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_price_tiers_cinema_format_idx
  ON ticket_price_tiers (cinema_id, format, is_active);
