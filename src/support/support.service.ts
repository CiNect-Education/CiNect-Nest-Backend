import { Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDto } from './dto/contact.dto';
import { ChatbotRequestDto } from './dto/chatbot.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

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
    await this.emailService.sendContactNotification({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
      ticketId: ticket.id,
    });
    return {
      message: 'Support ticket created',
      ticketId: ticket.id,
    };
  }

  private formatDateTime(date: Date, locale: 'vi' | 'en'): string {
    return date.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  }

  private tryLocalChatbotReply(
    message: string,
    context: Awaited<ReturnType<SupportService['buildChatContext']>>,
    locale: 'vi' | 'en',
  ): string | null {
    const q = message.toLowerCase();

    const wantsShowtimes =
      /suất|lịch chiếu|showtime|chiếu hôm nay|hôm nay chiếu|today.*show|upcoming/.test(q);
    const wantsMovies =
      /phim đang|đang chiếu|now showing|which movies|phim nào|movie.*showing/.test(q);
    const wantsPromos =
      /khuyến mãi|promo|mã giảm|voucher|coupon|giảm giá/.test(q);

    if (wantsShowtimes) {
      if (context.todayShowtimes.length === 0 && context.upcomingShowtimes.length === 0) {
        return locale === 'en'
          ? 'There are no upcoming showtimes in CiNect right now. You can browse movies on the Movies page or check back later — new showtimes are added regularly.'
          : 'Hiện CiNect chưa có suất chiếu sắp tới trong hệ thống. Bạn thử xem mục Phim hoặc quay lại sau nhé — lịch chiếu sẽ được cập nhật thường xuyên.';
      }

      const pickLine = (s: { line: string; lineEn: string }) =>
        locale === 'en' ? s.lineEn : s.line;

      const lines =
        context.todayShowtimes.length > 0
          ? context.todayShowtimes.slice(0, 12).map((s) => `• ${pickLine(s)}`)
          : context.upcomingShowtimes.slice(0, 12).map((s) => `• ${pickLine(s)}`);

      const intro =
        context.todayShowtimes.length > 0
          ? locale === 'en'
            ? 'Here are showtimes for today on CiNect:'
            : 'Suất chiếu hôm nay trên CiNect:'
          : locale === 'en'
            ? 'No showtimes left for today, but here are the nearest upcoming ones:'
            : 'Hôm nay không còn suất nào, nhưng đây là các suất sắp tới gần nhất:';

      const outro =
        locale === 'en'
          ? 'Pick a showtime on CiNect to book seats directly — no need to visit cinema websites.'
          : 'Bạn chọn suất trên CiNect là đặt vé luôn, không cần sang web rạp đâu nhé.';

      return [intro, ...lines, outro].join('\n');
    }

    if (wantsMovies) {
      const titles = context.nowShowingMovies.map((m) => `• ${m.title}`);
      if (titles.length === 0) {
        return locale === 'en'
          ? 'CiNect does not have any "now showing" movies listed at the moment. Check the Movies page for the latest updates.'
          : 'Hiện chưa có phim "đang chiếu" trên CiNect. Bạn vào mục Phim để xem cập nhật mới nhất nhé.';
      }
      const intro =
        locale === 'en'
          ? 'These movies are currently showing on CiNect:'
          : 'Các phim đang chiếu trên CiNect:';
      const outro =
        locale === 'en'
          ? 'Tap a movie to see showtimes and book tickets.'
          : 'Bấm vào phim để xem suất chiếu và đặt vé nhé.';
      return [intro, ...titles.slice(0, 15), outro].join('\n');
    }

    if (wantsPromos) {
      if (context.activePromotions.length === 0) {
        return locale === 'en'
          ? 'There are no active promotions on CiNect right now. Check the Promotions page — new deals show up often.'
          : 'Hiện chưa có khuyến mãi đang chạy trên CiNect. Bạn xem mục Khuyến mãi — deal mới hay có đấy.';
      }
      const lines = context.activePromotions.slice(0, 8).map((p) => {
        const code = p.code ? ` (mã: ${p.code})` : '';
        return `• ${p.title}${code}`;
      });
      const intro =
        locale === 'en'
          ? 'Active promotions on CiNect right now:'
          : 'Khuyến mãi đang có trên CiNect:';
      const outro =
        locale === 'en'
          ? 'Apply the code at checkout when booking.'
          : 'Nhập mã khi thanh toán vé là dùng được nhé.';
      return [intro, ...lines, outro].join('\n');
    }

    return null;
  }

  async chatbot(dto: ChatbotRequestDto) {
    const locale = (dto.locale ?? 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
    const key = (process.env.OPENAI_API_KEY ?? '').trim();
    const context = await this.buildChatContext();
    const contextBlock = this.formatChatContextForPrompt(context, locale);

    if (!key) {
      const local = this.tryLocalChatbotReply(dto.message, context, locale);
      return {
        reply:
          local ??
          (locale === 'en'
            ? 'Chatbot is not configured yet. Please set OPENAI_API_KEY on backend.'
            : 'Chatbot chưa được cấu hình. Vui lòng thêm OPENAI_API_KEY ở backend.'),
      };
    }

    const systemPrompt =
      locale === 'en'
        ? [
            'You are CiNect friendly cinema assistant — users book tickets on CiNect, not on external cinema websites.',
            'Always answer in natural, conversational English (2–8 sentences). Sound human, not like a corporate FAQ.',
            'Use the CiNect data block provided. When showtimes exist, list them with time, movie, cinema, format.',
            'Never say you "do not have access" if showtimes are in the data. Never tell users to check external cinema websites.',
            'If data is empty, say so plainly and suggest browsing Movies or Showtimes on CiNect.',
            'Do not invent prices, promo codes, or showtimes not in the data.',
            'Avoid stiff phrases like "However", "database snapshot", or "I currently do not have access".',
          ].join(' ')
        : [
            'Bạn là trợ lý thân thiện của CiNect — người dùng đặt vé trực tiếp trên CiNect, không cần sang web rạp khác.',
            'Luôn trả lời bằng tiếng Việt tự nhiên, thân thiện (2–8 câu), như nhân viên rạp chat với khách — không giọng robot hay FAQ cứng nhắc.',
            'Dùng đúng dữ liệu CiNect được cung cấp. Có suất chiếu thì liệt kê: giờ, phim, rạp, định dạng.',
            'Tuyệt đối không nói "không có quyền truy cập", "database snapshot", "However" hay bảo khách "check website rạp".',
            'Nếu không có suất hôm nay, nói thẳng và gợi ý xem mục Phim / Lịch chiếu trên CiNect.',
            'Không bịa giá vé, mã giảm giá hay suất chiếu không có trong dữ liệu.',
          ].join(' ');

    const userPrompt = `Câu hỏi: ${dto.message}\n\n${contextBlock}`;

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
          const local = this.tryLocalChatbotReply(dto.message, context, locale);
          if (local) return { reply: local };
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
      const local = this.tryLocalChatbotReply(dto.message, context, locale);
      if (local) return { reply: local };
      return { reply: this.chatbotErrorReply(locale, 'generic') };
    }
  }

  private formatChatContextForPrompt(
    context: Awaited<ReturnType<SupportService['buildChatContext']>>,
    locale: 'vi' | 'en',
  ): string {
    const header =
      locale === 'en'
        ? `CiNect data (updated ${this.formatDateTime(new Date(context.generatedAt), locale)}):`
        : `Dữ liệu CiNect (cập nhật ${this.formatDateTime(new Date(context.generatedAt), locale)}):`;

    const sections: string[] = [header];

    if (context.nowShowingMovies.length > 0) {
      sections.push(
        locale === 'en' ? 'Now showing:' : 'Phim đang chiếu:',
        ...context.nowShowingMovies.slice(0, 15).map((m) => `- ${m.title}`),
      );
    }

    if (context.todayShowtimes.length > 0) {
      sections.push(
        locale === 'en' ? "Today's showtimes:" : 'Suất chiếu hôm nay:',
        ...context.todayShowtimes.slice(0, 15).map((s) => `- ${s.line}`),
      );
    } else if (context.upcomingShowtimes.length > 0) {
      sections.push(
        locale === 'en' ? 'Upcoming showtimes:' : 'Suất chiếu sắp tới:',
        ...context.upcomingShowtimes.slice(0, 15).map((s) => `- ${s.line}`),
      );
    } else {
      sections.push(locale === 'en' ? 'Showtimes: none upcoming.' : 'Suất chiếu: chưa có suất sắp tới.');
    }

    if (context.activePromotions.length > 0) {
      sections.push(
        locale === 'en' ? 'Active promotions:' : 'Khuyến mãi đang chạy:',
        ...context.activePromotions.slice(0, 8).map((p) => {
          const code = p.code ? ` — mã ${p.code}` : '';
          return `- ${p.title}${code}`;
        }),
      );
    }

    sections.push(
      locale === 'en'
        ? `Totals: ${context.totals.upcomingShowtimes} upcoming showtimes, ${context.totals.activePromotions} promotions, ${context.totals.cinemas} cinemas.`
        : `Tổng quan: ${context.totals.upcomingShowtimes} suất sắp tới, ${context.totals.activePromotions} khuyến mãi, ${context.totals.cinemas} rạp.`,
    );

    return sections.join('\n');
  }

  private async buildChatContext() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

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
        take: 60,
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

    const formatShowtimeLine = (
      s: (typeof showtimes)[number],
      locale: 'vi' | 'en',
    ): string => {
      const when = this.formatDateTime(s.startTime, locale);
      const movie = s.movie?.title ?? (locale === 'en' ? 'Unknown movie' : 'Phim chưa rõ');
      const cinema = s.cinema?.name ?? (locale === 'en' ? 'Unknown cinema' : 'Rạp chưa rõ');
      const city = s.cinema?.city ? ` (${s.cinema.city})` : '';
      const format = s.format ? ` · ${s.format}` : '';
      const language = s.language ? ` · ${s.language}` : '';
      return `${when} — ${movie} @ ${cinema}${city}${format}${language}`;
    };

    const upcomingShowtimes = showtimes.map((s) => ({
      startTime: s.startTime,
      format: s.format,
      language: s.language,
      movieTitle: s.movie?.title ?? null,
      cinemaName: s.cinema?.name ?? null,
      city: s.cinema?.city ?? null,
      line: formatShowtimeLine(s, 'vi'),
      lineEn: formatShowtimeLine(s, 'en'),
    }));

    const todayShowtimes = upcomingShowtimes.filter(
      (s) => s.startTime >= startOfToday && s.startTime <= endOfToday,
    );

    const nowShowingMovies = movies
      .filter((m) => m.status === 'NOW_SHOWING')
      .map((m) => ({ title: m.title, status: m.status }));

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
      nowShowingMovies,
      upcomingShowtimes,
      todayShowtimes,
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
