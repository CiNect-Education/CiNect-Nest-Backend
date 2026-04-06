import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './dto/contact.dto';
import { ChatbotRequestDto } from './dto/chatbot.dto';

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

  async chatbot(dto: ChatbotRequestDto) {
    const locale = (dto.locale ?? 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
    const key = (process.env.OPENAI_API_KEY ?? '').trim();
    const context = await this.buildChatContext();

    if (!key) {
      return {
        reply:
          locale === 'en'
            ? 'Chatbot is not configured yet. Please set OPENAI_API_KEY on backend.'
            : 'Chatbot chưa được cấu hình. Vui lòng thêm OPENAI_API_KEY ở backend.',
      };
    }

    const systemPrompt =
      locale === 'en'
        ? [
            'You are CiNect professional assistant.',
            'Priority #1: use CiNect database context for cinema/business questions.',
            'If user asks general knowledge not in DB, provide a concise helpful answer and explicitly label it as general guidance.',
            'Never fabricate exact business facts (showtimes, prices, promo codes, movie status). If missing, say not available in current database snapshot.',
            'Answer in a professional, clear style with short bullet points when useful.',
          ].join(' ')
        : [
            'Bạn là trợ lý chuyên nghiệp của CiNect.',
            'Ưu tiên số 1: dùng context dữ liệu CiNect cho câu hỏi nghiệp vụ rạp.',
            'Nếu người dùng hỏi kiến thức tổng quát không có trong DB, vẫn trả lời ngắn gọn hữu ích và ghi rõ đó là hướng dẫn chung.',
            'Không bịa đặt dữ liệu nghiệp vụ cụ thể (suất chiếu, giá, mã khuyến mãi, trạng thái phim). Nếu thiếu dữ liệu, phải nói rõ chưa có trong snapshot hiện tại.',
            'Trả lời chuyên nghiệp, rõ ràng, ưu tiên gạch đầu dòng khi phù hợp.',
          ].join(' ');

    const userPrompt = `${dto.message}\n\n=== DATABASE CONTEXT ===\n${JSON.stringify(context)}`;

    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_output_tokens: 700,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Chatbot upstream error: ${res.status} ${text}`);
      }

      const data = (await res.json()) as { output_text?: string };
      const reply = data.output_text?.trim();
      return {
        reply:
          reply && reply.length > 0
            ? reply
            : locale === 'en'
              ? 'No answer generated. Please try again.'
              : 'Chưa tạo được phản hồi. Vui lòng thử lại.',
      };
    } catch {
      return {
        reply:
          locale === 'en'
            ? 'Chatbot is temporarily unavailable. Please try again.'
            : 'Chatbot đang tạm thời không khả dụng. Vui lòng thử lại.',
      };
    }
  }

  private async buildChatContext() {
    const now = new Date();
    const [movies, cinemas, showtimes, promotions, news, counts] = await Promise.all([
      this.prisma.movie.findMany({
        where: { isDeleted: false },
        orderBy: [{ status: 'asc' }, { releaseDate: 'desc' }],
        take: 20,
        select: { title: true, status: true, releaseDate: true, duration: true, ageRating: true },
      }),
      this.prisma.cinema.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        take: 20,
        select: { name: true, city: true, district: true, address: true },
      }),
      this.prisma.showtime.findMany({
        where: { isActive: true, startTime: { gte: now } },
        orderBy: { startTime: 'asc' },
        take: 40,
        select: {
          startTime: true,
          format: true,
          language: true,
          movie: { select: { title: true } },
          cinema: { select: { name: true, city: true } },
        },
      }),
      this.prisma.promotion.findMany({
        where: { status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } },
        orderBy: { endDate: 'asc' },
        take: 12,
        select: {
          title: true,
          code: true,
          discountType: true,
          discountValue: true,
          minPurchase: true,
          maxDiscount: true,
          endDate: true,
        },
      }),
      this.prisma.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 12,
        select: { title: true, category: true, publishedAt: true },
      }),
      this.prisma.$transaction([
        this.prisma.movie.count({ where: { isDeleted: false } }),
        this.prisma.cinema.count({ where: { isActive: true } }),
        this.prisma.showtime.count({ where: { isActive: true, startTime: { gte: now } } }),
        this.prisma.promotion.count({
          where: { status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } },
        }),
      ]),
    ]);

    return {
      generatedAt: now.toISOString(),
      totals: {
        movies: counts[0],
        cinemas: counts[1],
        upcomingShowtimes: counts[2],
        activePromotions: counts[3],
      },
      movies,
      cinemas,
      upcomingShowtimes: showtimes.map((s) => ({
        startTime: s.startTime,
        format: s.format,
        language: s.language,
        movieTitle: s.movie?.title ?? null,
        cinemaName: s.cinema?.name ?? null,
        city: s.cinema?.city ?? null,
      })),
      activePromotions: promotions.map((p) => ({
        ...p,
        discountValue: Number(p.discountValue),
        minPurchase: Number(p.minPurchase),
        maxDiscount: p.maxDiscount == null ? null : Number(p.maxDiscount),
      })),
      latestNews: news,
    };
  }
}
