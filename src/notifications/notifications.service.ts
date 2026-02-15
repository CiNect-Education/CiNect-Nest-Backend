import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const skip = (page - 1) * limit;
    const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    const meta = new PageMeta(page, limit, total);
    return { data: items, meta };
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { message: 'Notification marked as read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId },
      data: { isRead: true },
    });
    return { message: 'All notifications marked as read' };
  }
}
