import { readFileSync } from 'fs';
import { join } from 'path';
import { PROVINCES_LEGACY } from '../../prisma/data/provinces-legacy';
import { PROVINCES_NEW } from '../../prisma/data/provinces-new';

export const OPEN_API_BASE = 'https://provinces.open-api.vn/api';

export type OpenApiProvinceRow = {
  name: string;
  code: number;
  codename: string;
  division_type?: string;
};

const V2_CODE_ALIASES: Record<string, string> = {
  ho_chi_minh: 'ho-chi-minh-city',
};

const LEGACY_MERGED_INTO = Object.fromEntries(
  PROVINCES_LEGACY.map((p) => [p.code, p.mergedInto]),
) as Record<string, string>;

const SEED_NAME_EN: Record<string, string> = Object.fromEntries([
  ...PROVINCES_NEW.map((p) => [p.code, p.nameEn]),
  ...PROVINCES_LEGACY.map((p) => [p.code, p.nameEn]),
]);

const DATA_DIR = join(process.cwd(), 'prisma', 'data');

function readSnapshot(fileName: string): OpenApiProvinceRow[] {
  const raw = readFileSync(join(DATA_DIR, fileName), 'utf8');
  return JSON.parse(raw) as OpenApiProvinceRow[];
}

const V1_SLUG_ALIASES: Record<string, string> = {
  hue: 'thua-thien-hue',
};

export function v1CodenameToSlug(codename: string): string {
  const stripped = codename.replace(/^tinh_/, '').replace(/^thanh_pho_/, '');
  const slug = stripped.replace(/_/g, '-');
  return V1_SLUG_ALIASES[slug] ?? slug;
}

export function v2CodenameToCode(codename: string): string {
  return V2_CODE_ALIASES[codename] ?? codename.replace(/_/g, '-');
}

export function seedNameEn(code: string, fallbackName?: string): string {
  if (SEED_NAME_EN[code]) return SEED_NAME_EN[code];
  if (fallbackName?.trim()) return fallbackName.trim();
  return code
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function legacyMergedInto(legacySlug: string): string | undefined {
  return LEGACY_MERGED_INTO[legacySlug];
}

export async function fetchOpenApiJson<T>(
  path: string,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPEN_API_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Open API ${path} failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadOpenApiProvinceLists(): Promise<{
  v2Rows: OpenApiProvinceRow[];
  v1Rows: OpenApiProvinceRow[];
  usedSnapshot: boolean;
}> {
  try {
    const [v2Rows, v1Rows] = await Promise.all([
      fetchOpenApiJson<OpenApiProvinceRow[]>('/v2/?depth=1'),
      fetchOpenApiJson<OpenApiProvinceRow[]>('/v1/?depth=1'),
    ]);
    if (!Array.isArray(v2Rows) || !Array.isArray(v1Rows)) {
      throw new Error('Open API returned invalid payload');
    }
    return { v2Rows, v1Rows, usedSnapshot: false };
  } catch {
    return {
      v2Rows: readSnapshot('open-api-v2-provinces.json'),
      v1Rows: readSnapshot('open-api-v1-provinces.json'),
      usedSnapshot: true,
    };
  }
}

export async function resolveNewCodeFromLegacyApi(
  legacyNumericCode: number,
): Promise<string | undefined> {
  try {
    const row = await fetchOpenApiJson<OpenApiProvinceRow>(
      `/v2/p/from-legacy/?legacy_code=${legacyNumericCode}`,
      8_000,
    );
    if (row?.codename) return v2CodenameToCode(row.codename);
  } catch {
    // fall back to static merge map
  }
  return undefined;
}
