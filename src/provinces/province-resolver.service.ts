import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SHORT_ALIASES: Record<string, string> = {
  hcm: 'ho-chi-minh-city',
  hn: 'ha-noi',
  dn: 'da-nang',
  hp: 'hai-phong',
  ct: 'can-tho',
  bd: 'ho-chi-minh-city',
  nt: 'khanh-hoa',
  vt: 'ho-chi-minh-city',
};

function normalizeText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

@Injectable()
export class ProvinceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveToNewCode(input?: string): Promise<string | undefined> {
    if (!input?.trim()) return undefined;
    const raw = input.trim();
    const low = raw.toLowerCase();

    if (SHORT_ALIASES[low]) return SHORT_ALIASES[low];

    const byLegacyCode = await this.prisma.provinceLegacy.findUnique({
      where: { code: low },
      include: { provinceNew: { select: { code: true } } },
    });
    if (byLegacyCode?.provinceNew?.code) return byLegacyCode.provinceNew.code;

    const byNewCode = await this.prisma.provinceNew.findUnique({
      where: { code: low },
      select: { code: true },
    });
    if (byNewCode?.code) return byNewCode.code;

    const norm = normalizeText(raw);
    const legacyByName = await this.prisma.provinceLegacy.findMany({
      include: { provinceNew: { select: { code: true, nameVi: true, nameEn: true } } },
    });
    for (const item of legacyByName) {
      if (normalizeText(item.nameVi) === norm || normalizeText(item.nameEn) === norm) {
        return item.provinceNew.code;
      }
    }

    const newByName = await this.prisma.provinceNew.findMany({
      select: { code: true, nameVi: true, nameEn: true },
    });
    for (const item of newByName) {
      if (normalizeText(item.nameVi) === norm || normalizeText(item.nameEn) === norm) {
        return item.code;
      }
    }

    if (SLUG_PATTERN.test(low)) return low;
    return undefined;
  }
}
