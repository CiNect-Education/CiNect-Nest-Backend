-- Provinces (34 new + 63 legacy) and cinema linkage

CREATE TABLE provinces_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name_vi VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE provinces_legacy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name_vi VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    province_new_id UUID NOT NULL REFERENCES provinces_new(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provinces_legacy_new ON provinces_legacy(province_new_id);

ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS ward VARCHAR(200);
ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS province_new_id UUID REFERENCES provinces_new(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cinemas_province_new ON cinemas(province_new_id) WHERE is_active = TRUE;
