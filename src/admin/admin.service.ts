import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuditLogs(
    page = 0,
    limit = 50,
    entityType?: string,
    userId?: string,
    search?: string,
    from?: string,
    to?: string,
    action?: string,
  ) {
    const safePage = Math.max(0, page);
    const skip = safePage * limit;
    const and: Prisma.AuditLogWhereInput[] = [];
    if (entityType) and.push({ entityType });
    if (userId) and.push({ userId });
    if (search) {
      and.push({
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (from || to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (from) {
        const fromDate = new Date(`${from}T00:00:00.000Z`);
        if (!Number.isNaN(fromDate.getTime())) createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(`${to}T23:59:59.999Z`);
        if (!Number.isNaN(toDate.getTime())) createdAt.lte = toDate;
      }
      if (createdAt.gte || createdAt.lte) and.push({ createdAt });
    }
    if (action) {
      const normalized = action.toUpperCase();
      if (normalized === 'CREATE') and.push({ action: { startsWith: 'POST' } });
      else if (normalized === 'UPDATE') {
        and.push({
          OR: [{ action: { startsWith: 'PUT' } }, { action: { startsWith: 'PATCH' } }],
        });
      } else if (normalized === 'DELETE') and.push({ action: { startsWith: 'DELETE' } });
      else and.push({ action: { startsWith: normalized } });
    }
    const where: Prisma.AuditLogWhereInput = and.length > 0 ? { AND: and } : {};

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const meta = new PageMeta(safePage, limit, total);
    return { data: items, meta };
  }
}
