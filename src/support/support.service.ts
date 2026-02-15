import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './dto/contact.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async contact(dto: ContactDto, userId?: string) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: userId ?? null,
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        category: dto.category ?? 'OTHER',
        message: dto.message,
        bookingId: dto.bookingId ?? null,
      },
    });
    return {
      message: 'Support ticket created',
      ticketId: ticket.id,
    };
  }
}
