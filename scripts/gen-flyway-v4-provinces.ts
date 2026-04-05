import { PROVINCES_NEW } from '../prisma/data/provinces-new';
import { PROVINCES_LEGACY } from '../prisma/data/provinces-legacy';
import * as fs from 'fs';
import * as path from 'path';

function q(s: string) {
  return "'" + s.replace(/'/g, "''") + "'";
}

const lines: string[] = [];
lines.push('-- CiNect V4: provinces (34 new + 63 legacy) + cinema linkage (Nest prisma migration parity)');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS provinces_new (');
lines.push('    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),');
lines.push('    code VARCHAR(64) NOT NULL UNIQUE,');
lines.push('    name_vi VARCHAR(255) NOT NULL,');
lines.push('    name_en VARCHAR(255) NOT NULL,');
lines.push('    sort_order INT NOT NULL DEFAULT 0,');
lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),');
lines.push('    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
lines.push(');');
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS provinces_legacy (');
lines.push('    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),');
lines.push('    code VARCHAR(64) NOT NULL UNIQUE,');
lines.push('    name_vi VARCHAR(255) NOT NULL,');
lines.push('    name_en VARCHAR(255) NOT NULL,');
lines.push('    province_new_id UUID NOT NULL REFERENCES provinces_new(id) ON DELETE RESTRICT,');
lines.push('    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
lines.push(');');
lines.push('');
lines.push('CREATE INDEX IF NOT EXISTS idx_provinces_legacy_new ON provinces_legacy(province_new_id);');
lines.push('');
lines.push('ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS ward VARCHAR(200);');
lines.push('ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS province_new_id UUID REFERENCES provinces_new(id) ON DELETE SET NULL;');
lines.push('CREATE INDEX IF NOT EXISTS idx_cinemas_province_new ON cinemas(province_new_id) WHERE is_active = TRUE;');
lines.push('');
lines.push('INSERT INTO provinces_new (code, name_vi, name_en, sort_order) VALUES');
lines.push(PROVINCES_NEW.map((p) => '  (' + [q(p.code), q(p.nameVi), q(p.nameEn), p.sortOrder].join(', ') + ')').join(',\n'));
lines.push('ON CONFLICT (code) DO NOTHING;');
lines.push('');
lines.push('INSERT INTO provinces_legacy (code, name_vi, name_en, province_new_id)');
lines.push('SELECT v.code, v.name_vi, v.name_en, n.id');
lines.push('FROM (VALUES');
lines.push(
  PROVINCES_LEGACY.map(
    (r) => '  (' + [q(r.code), q(r.nameVi), q(r.nameEn), q(r.mergedInto)].join(', ') + '::text)',
  ).join(',\n'),
);
lines.push(') AS v(code, name_vi, name_en, new_code)');
lines.push('JOIN provinces_new n ON n.code = v.new_code');
lines.push('ON CONFLICT (code) DO NOTHING;');
lines.push('');
lines.push('-- Backfill demo cinemas from V2 seed (English city labels)');
lines.push(
  "UPDATE cinemas c SET province_new_id = pn.id FROM provinces_new pn WHERE c.city = 'Ho Chi Minh' AND pn.code = 'ho-chi-minh-city';",
);
lines.push(
  "UPDATE cinemas c SET province_new_id = pn.id FROM provinces_new pn WHERE c.city = 'Ha Noi' AND pn.code = 'ha-noi';",
);
lines.push('');

const out = path.resolve(__dirname, '../../cinect-spring-backend/src/main/resources/db/migration/V4__provinces_and_cinema_link.sql');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('Wrote', out);
