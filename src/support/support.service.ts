import { Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './dto/contact.dto';
import { ChatbotRequestDto } from './dto/chatbot.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** REST Responses API does not always include top-level `output_text`; parse from `output`. */
  private extractReplyText(data: unknown): string {
    if (data == null || typeof data !== 'object') return '';
    const o = data as Record<string, unknown>;
    if (typeof o.output_text === 'string' && o.output_text.trim()) {
      return o.output_text.trim();
    }
    const output = o.output;
    if (!Array.isArray(output)) return '';
    const parts: string[] = [];
    for (const item of output) {
      if (item == null || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (row.type !== 'message' || !Array.isArray(row.content)) continue;
      for (const block of row.content) {
        if (block == null || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'output_text' && typeof b.text === 'string' && b.text.trim()) {
          parts.push(b.text.trim());
        }
      }
    }
    return parts.join('\n\n');
  }

  /** Local dev on Windows may hit UNABLE_TO_VERIFY_LEAF_SIGNATURE (antivirus / proxy SSL). */
  private callOpenAi(body: Record<string, unknown>): Promise<Response> {
    const payload = JSON.stringify(body);
    const allowInsecureTls =
      process.env.OPENAI_INSECURE_TLS === 'true' &&
      process.env.NODE_ENV !== 'production';

    if (allowInsecureTls) {
      this.logger.warn(
        'OPENAI_INSECURE_TLS=true — TLS verification disabled for OpenAI (dev only)',
      );
      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'api.openai.com',
            path: '/v1/responses',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${(process.env.OPENAI_API_KEY ?? '').trim()}`,
              'Content-Length': Buffer.byteLength(payload),
            },
            rejectUnauthorized: false,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve(
                new Response(text, {
                  status: res.statusCode ?? 500,
                  headers: { 'Content-Type': 'application/json' },
                }),
              );
            });
          },
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }

    return fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(process.env.OPENAI_API_KEY ?? '').trim()}`,
      },
      body: payload,
    });
  }

  private chatbotErrorReply(
    locale: 'vi' | 'en',
    reason: 'tls' | 'quota' | 'auth' | 'generic',
  ): string {
    if (locale === 'en') {
      switch (reason) {
        case 'tls':
          return 'Chatbot cannot reach OpenAI (SSL certificate issue on this machine). Set OPENAI_INSECURE_TLS=true in backend .env for local dev only, or fix antivirus/proxy SSL inspection.';
        case 'quota':
          return 'OpenAI quota exceeded. Add billing or credits at platform.openai.com, then try again.';
        case 'auth':
          return 'Invalid OpenAI API key. Update OPENAI_API_KEY in backend .env.';
        default:
          return 'Chatbot is temporarily unavailable. Please try again.';
      }
    }
    switch (reason) {
      case 'tls':
        return 'Chatbot không kết nối được OpenAI (lỗi chứng chỉ SSL trên máy này). Dev: thêm OPENAI_INSECURE_TLS=true vào .env backend (chỉ local), hoặc tắt quét SSL của antivirus/proxy.';
      case 'quota':
        return 'Tài khoản OpenAI đã hết quota. Vui lòng nạp credit / bật billing tại platform.openai.com rồi thử lại.';
      case 'auth':
        return 'API key OpenAI không hợp lệ. Kiểm tra OPENAI_API_KEY trong file .env backend.';
      default:
        return 'Chatbot đang tạm thời không khả dụng. Vui lòng thử lại.';
    }
  }

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
      const res = await this.callOpenAi({
        model: process.env.OPENAI_CHATBOT_MODEL?.trim() || 'gpt-4o-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_output_tokens: 700,
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`OpenAI chatbot HTTP ${res.status}: ${text.slice(0, 400)}`);
        let code = '';
        try {
          const parsed = JSON.parse(text) as {
            error?: { code?: string };
          };
          code = parsed.error?.code ?? '';
        } catch {
          /* ignore */
        }
        if (res.status === 429 || code === 'insufficient_quota') {
          return { reply: this.chatbotErrorReply(locale, 'quota') };
        }
        if (res.status === 401) {
          return { reply: this.chatbotErrorReply(locale, 'auth') };
        }
        throw new Error(`Chatbot upstream error: ${res.status}`);
      }

      const data = await res.json();
      const reply = this.extractReplyText(data);
      if (!reply) {
        this.logger.warn('OpenAI chatbot returned empty text output');
      }
      return {
        reply:
          reply.length > 0
            ? reply
            : locale === 'en'
              ? 'No answer generated. Please try again.'
              : 'Chưa tạo được phản hồi. Vui lòng thử lại.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : '';
      this.logger.warn(`Chatbot failed: ${msg}${cause ? ` (${cause})` : ''}`);

      const tlsHint =
        msg.includes('fetch failed') ||
        cause.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
        cause.includes('certificate');
      if (tlsHint) {
        return { reply: this.chatbotErrorReply(locale, 'tls') };
      }
      return { reply: this.chatbotErrorReply(locale, 'generic') };
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
