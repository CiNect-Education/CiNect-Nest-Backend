import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { NewsCategory, Prisma, RoomFormat, UserRole } from '@prisma/client';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { CreateMovieDto } from '../movies/dto/create-movie.dto';
import { UpdateMovieDto } from '../movies/dto/update-movie.dto';
import { CreateCinemaDto } from '../cinemas/dto/create-cinema.dto';
import { UpdateCinemaDto } from '../cinemas/dto/update-cinema.dto';
import { CreateRoomDto } from '../cinemas/dto/create-room.dto';
import {
  CreateNewsArticleAdminDto,
  UpdateNewsArticleAdminDto,
  CreateCampaignAdminDto,
  UpdateCampaignAdminDto,
  CreateBannerAdminDto,
  UpdateBannerAdminDto,
} from './dto/admin-content.dto';
import { ProvincesSyncService } from '../provinces/provinces-sync.service';
import { CommunityService } from '../community/community.service';
import { generateReferralCode } from '../community/community.utils';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly provincesSyncService: ProvincesSyncService,
    private readonly bookingsService: BookingsService,
    private readonly communityService: CommunityService,
  ) {}

  private parseRangeDays(range?: string): number {
    if (range === '7d') return 7;
    if (range === '90d') return 90;
    return 30;
  }

  private toDateKey(d: Date): string {
    // Use ISO date (UTC) for stable keys.
    return d.toISOString().slice(0, 10);
  }

  private isUuid(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const v = value.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

  /** Accepts standard UUID or 32 hex digits with stray spaces (common copy/paste from docs). */
  private normalizeUuidInput(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const hex = value.replace(/[^0-9a-f]/gi, '');
    if (hex.length !== 32) return null;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
  }

  private parseRoomFormat(input?: string): RoomFormat {
    if (!input) return RoomFormat.STANDARD2D;
    // Accept either Prisma enum key or frontend label.
    if (Object.values(RoomFormat).includes(input as RoomFormat)) return input as RoomFormat;
    if (input === '2D') return RoomFormat.STANDARD2D;
    if (input === '3D') return RoomFormat.STANDARD3D;
    if (input === '4DX') return RoomFormat.FOURDX;
    if (input === 'IMAX') return RoomFormat.IMAX;
    if (input === 'DOLBY') return RoomFormat.DOLBY;
    return RoomFormat.STANDARD2D;
  }

  @Get('audit-logs')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'action', required: false })
  getAuditLogs(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(page, limit, entityType, userId, search, from, to, action);
  }

  @Get('kpis')
  @ApiQuery({ name: 'range', required: false })
  async getKpis(@Query('range') range?: string) {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [revenue, bookings, users, showtimes, totalMovies, totalCinemas, capacitySeats, bookedSeats] =
      await Promise.all([
      this.prisma.booking.aggregate({
        where: { status: 'CONFIRMED', createdAt: { gte: since } },
        _sum: { finalAmount: true },
        _count: true,
      }),
      this.prisma.booking.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.count(),
      this.prisma.showtime.count({
        where: { isActive: true, startTime: { gte: since } },
      }),
      this.prisma.movie.count({ where: { isDeleted: false } }),
      this.prisma.cinema.count({ where: { isActive: true } }),
      this.prisma.showtime.findMany({
        where: { isActive: true, startTime: { gte: since } },
        select: { room: { select: { totalSeats: true } } },
      }),
      this.prisma.bookingItem.count({
        where: {
          booking: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
          showtime: { isActive: true, startTime: { gte: since } },
        },
      }),
    ]);

    let capacity = 0;
    for (const st of capacitySeats) {
      capacity += st.room.totalSeats ?? 0;
    }
    const occupancyRate = capacity > 0 ? bookedSeats / capacity : 0;

    return {
      totalRevenue: Number(revenue._sum.finalAmount ?? 0),
      totalBookings: bookings,
      totalUsers: users,
      confirmedBookings: revenue._count,
      totalShowtimes: showtimes,
      totalMovies,
      totalCinemas,
      occupancyRate,
    };
  }

  @Get('revenue')
  @ApiQuery({ name: 'range', required: false })
  async getRevenueSeries(@Query('range') range?: string) {
    const days = this.parseRangeDays(range);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: start },
      },
      select: { createdAt: true, finalAmount: true },
    });

    const byDate = new Map<string, number>();
    for (const b of bookings) {
      const k = this.toDateKey(b.createdAt);
      byDate.set(k, (byDate.get(k) ?? 0) + Number(b.finalAmount ?? 0));
    }

    // Fill missing dates with 0 to stabilize chart UX.
    const out: Array<{ date: string; revenue: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = this.toDateKey(d);
      out.push({ date: k, revenue: byDate.get(k) ?? 0 });
    }
    return out;
  }

  @Get('occupancy')
  @ApiQuery({ name: 'range', required: false })
  async getOccupancySeries(@Query('range') range?: string) {
    const days = this.parseRangeDays(range);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const showtimes = await this.prisma.showtime.findMany({
      where: { isActive: true, startTime: { gte: start } },
      select: {
        id: true,
        startTime: true,
        room: { select: { totalSeats: true } },
      },
    });

    const showtimeIds = showtimes.map((s) => s.id);
    const bookedByShowtime = new Map<string, number>();

    if (showtimeIds.length > 0) {
      const booked = await this.prisma.bookingItem.groupBy({
        by: ['showtimeId'],
        where: {
          showtimeId: { in: showtimeIds },
          booking: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
        },
        _count: true,
      });
      for (const b of booked) {
        bookedByShowtime.set(b.showtimeId, b._count);
      }
    }

    const byDate = new Map<string, { booked: number; capacity: number }>();
    for (const st of showtimes) {
      const k = this.toDateKey(st.startTime);
      const capacity = st.room.totalSeats ?? 0;
      const booked = bookedByShowtime.get(st.id) ?? 0;
      const prev = byDate.get(k) ?? { booked: 0, capacity: 0 };
      prev.booked += booked;
      prev.capacity += capacity;
      byDate.set(k, prev);
    }

    const out: Array<{ date: string; occupancy: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = this.toDateKey(d);
      const v = byDate.get(k);
      const occupancy = v && v.capacity > 0 ? v.booked / v.capacity : 0;
      out.push({ date: k, occupancy });
    }
    return out;
  }

  @Get('analytics/revenue')
  @ApiQuery({ name: 'range', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getAnalyticsRevenue(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (from && to) {
      const dateFrom = new Date(`${from}T00:00:00.000Z`);
      const dateTo = new Date(`${to}T23:59:59.999Z`);
      const bookings = await this.prisma.booking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: { createdAt: true, finalAmount: true },
      });
      const byDate = new Map<string, number>();
      for (const b of bookings) {
        const k = this.toDateKey(b.createdAt);
        byDate.set(k, (byDate.get(k) ?? 0) + Number(b.finalAmount ?? 0));
      }
      return Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, revenue]) => ({ date, revenue }));
    }
    return this.getRevenueSeries(range);
  }

  @Get('analytics/forecast')
  @ApiQuery({ name: 'range', required: false })
  async getAnalyticsForecast(@Query('range') range?: string) {
    // Lightweight forecast: use recent moving average.
    const revenue = await this.getRevenueSeries(range);
    const avg =
      revenue.length > 0
        ? revenue.reduce((s, r) => s + Number(r.revenue ?? 0), 0) / revenue.length
        : 0;
    const out: Array<{ date: string; revenue: number }> = [];
    const horizon = 7;
    for (let i = 1; i <= horizon; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ date: this.toDateKey(d), revenue: Math.round(avg) });
    }
    return out;
  }

  @Get('analytics/occupancy')
  @ApiQuery({ name: 'range', required: false })
  async getAnalyticsOccupancy(@Query('range') range?: string) {
    const days = this.parseRangeDays(range);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const showtimes = await this.prisma.showtime.findMany({
      where: { isActive: true, startTime: { gte: start } },
      select: { id: true, startTime: true, cinema: { select: { id: true, name: true } }, room: { select: { totalSeats: true } } },
    });
    const showtimeIds = showtimes.map((s) => s.id);
    const booked = showtimeIds.length
      ? await this.prisma.bookingItem.groupBy({
          by: ['showtimeId'],
          where: { showtimeId: { in: showtimeIds }, booking: { status: { in: ['CONFIRMED', 'COMPLETED'] } } },
          _count: true,
        })
      : [];
    const bookedMap = new Map(booked.map((b) => [b.showtimeId, b._count]));
    return showtimes.map((st) => {
      const capacity = st.room.totalSeats ?? 0;
      const cnt = bookedMap.get(st.id) ?? 0;
      return {
        cinemaId: st.cinema?.id ?? '',
        cinemaName: st.cinema?.name ?? '',
        date: this.toDateKey(st.startTime),
        occupancy: capacity > 0 ? cnt / capacity : 0,
      };
    });
  }

  @Get('analytics/customer-segments')
  async getAnalyticsCustomerSegments() {
    const users = await this.prisma.user.findMany({ select: { createdAt: true } });
    const now = Date.now();
    let newCount = 0;
    let returning = 0;
    for (const u of users) {
      const ageDays = (now - u.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays <= 30) newCount++;
      else returning++;
    }
    const total = users.length || 1;
    return [
      { segment: 'New', count: newCount, percentage: (newCount / total) * 100 },
      { segment: 'Returning', count: returning, percentage: (returning / total) * 100 },
    ];
  }

  @Get('analytics/peak-hours')
  async getAnalyticsPeakHours() {
    const bookings = await this.prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
      select: { createdAt: true },
    });
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, bookings: 0 }));
    for (const b of bookings) {
      const h = b.createdAt.getHours();
      hours[h].bookings += 1;
    }
    return hours;
  }

  // Movies CRUD
  @Get('movies')
  async listMovies() {
    const raw = await this.prisma.movie.findMany({
      where: { isDeleted: false },
      include: { movieGenres: { include: { genre: true } } },
      orderBy: { releaseDate: 'desc' },
    });

    const data = raw.map((m) => ({
      id: m.id,
      title: m.title,
      originalTitle: m.originalTitle ?? undefined,
      slug: m.slug,
      description: m.description,
      posterUrl: m.posterUrl,
      bannerUrl: m.bannerUrl ?? undefined,
      trailerUrl: m.trailerUrl ?? undefined,
      galleryUrls: Array.isArray(m.galleryUrls) ? m.galleryUrls : [],
      duration: m.duration,
      releaseDate: m.releaseDate.toISOString(),
      endDate: m.endDate ? m.endDate.toISOString() : undefined,
      genres: m.movieGenres.map((mg) => ({
        id: mg.genre.id,
        name: mg.genre.name,
        slug: mg.genre.slug,
      })),
      director: m.director,
      cast: [],
      language: m.language,
      subtitles: m.subtitles ?? undefined,
      rating: Number(m.rating ?? 0),
      ratingCount: m.ratingCount,
      ageRating: m.ageRating,
      formats: Array.isArray(m.formats) ? m.formats : [],
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return { data };
  }

  @Post('movies')
  createMovie(@Body() dto: CreateMovieDto) {
    return this.prisma.movie.create({
      data: {
        title: dto.title,
        originalTitle: dto.originalTitle,
        slug: dto.slug,
        description: dto.description,
        posterUrl: dto.posterUrl,
        bannerUrl: dto.bannerUrl,
        trailerUrl: dto.trailerUrl,
        galleryUrls: (dto.galleryUrls ?? []) as object,
        duration: dto.duration,
        releaseDate: new Date(dto.releaseDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        director: dto.director,
        castMembers: (dto.castMembers ?? []) as object,
        language: dto.language ?? 'Vietnamese',
        subtitles: dto.subtitles,
        ageRating: dto.ageRating ?? 'P',
        formats: (dto.formats ?? ['2D']) as object,
        status: dto.status ?? 'COMING_SOON',
        ...(dto.genreIds?.length
          ? {
              movieGenres: {
                create: dto.genreIds.map((gid) => ({ genreId: gid })),
              },
            }
          : {}),
      },
    });
  }

  @Put('movies/:id')
  updateMovie(@Param('id', ParseUuidPipe) id: string, @Body() dto: UpdateMovieDto) {
    return this.prisma.movie.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.originalTitle !== undefined && { originalTitle: dto.originalTitle }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.description && { description: dto.description }),
        ...(dto.posterUrl && { posterUrl: dto.posterUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(dto.trailerUrl !== undefined && { trailerUrl: dto.trailerUrl }),
        ...(dto.galleryUrls && { galleryUrls: dto.galleryUrls as object }),
        ...(dto.duration && { duration: dto.duration }),
        ...(dto.releaseDate && { releaseDate: new Date(dto.releaseDate) }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.director && { director: dto.director }),
        ...(dto.castMembers && { castMembers: dto.castMembers as object }),
        ...(dto.language && { language: dto.language }),
        ...(dto.subtitles !== undefined && { subtitles: dto.subtitles }),
        ...(dto.ageRating && { ageRating: dto.ageRating }),
        ...(dto.formats && { formats: dto.formats as object }),
        ...(dto.status && { status: dto.status }),
      },
    });
  }

  @Delete('movies/:id')
  deleteMovie(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.movie.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  // Cinemas CRUD
  @Get('cinemas')
  async listCinemas() {
    const raw = await this.prisma.cinema.findMany({
      where: { isActive: true },
      include: { rooms: true },
      orderBy: { createdAt: 'desc' },
    });

    const data = raw.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      address: c.address,
      city: c.city,
      district: c.district ?? undefined,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      imageUrl: c.imageUrl ?? undefined,
      amenities: Array.isArray(c.amenities) ? c.amenities : [],
      latitude: c.latitude ?? undefined,
      longitude: c.longitude ?? undefined,
      rooms: c.rooms.map((r) => ({
        id: r.id,
        cinemaId: r.cinemaId,
        name: r.name,
        format: mapRoomFormat(r.format),
        totalSeats: r.totalSeats ?? 0,
        rows: r.rows ?? 0,
        columns: r.columns ?? 0,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { data };
  }

  @Post('cinemas')
  createCinema(@Body() dto: CreateCinemaDto) {
    return this.prisma.cinema.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        address: dto.address,
        city: dto.city,
        district: dto.district,
        phone: dto.phone,
        email: dto.email,
        imageUrl: dto.imageUrl,
        amenities: (dto.amenities ?? []) as object,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Put('cinemas/:id')
  updateCinema(@Param('id', ParseUuidPipe) id: string, @Body() dto: UpdateCinemaDto) {
    return this.prisma.cinema.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.address && { address: dto.address }),
        ...(dto.city && { city: dto.city }),
        ...(dto.district !== undefined && { district: dto.district }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.amenities && { amenities: dto.amenities as object }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  @Post('cinemas/:cinemaId/rooms')
  createRoom(
    @Param('cinemaId', ParseUuidPipe) cinemaId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.prisma.room.create({
      data: {
        cinemaId,
        name: dto.name,
        format: this.parseRoomFormat(dto.format as string | undefined),
        totalSeats: dto.totalSeats ?? 0,
        rows: dto.rows ?? 0,
        columns: dto.columns ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Post('rooms')
  async createRoomDirect(@Body() body: Partial<CreateRoomDto> & { cinemaId?: string }) {
    if (!body.cinemaId) {
      throw new NotFoundException('cinemaId is required');
    }
    const created = await this.prisma.room.create({
      data: {
        cinemaId: body.cinemaId,
        name: body.name ?? 'New Room',
        format: this.parseRoomFormat(body.format),
        totalSeats: body.totalSeats ?? 0,
        rows: body.rows ?? 0,
        columns: body.columns ?? 0,
        isActive: body.isActive ?? true,
      },
    });

    return {
      ...created,
      format: mapRoomFormat(created.format),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  @Get('rooms')
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listRooms(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
    @Query('cinemaId') cinemaId?: string,
  ) {
    const where: { cinemaId?: string } = {};
    if (cinemaId) where.cinemaId = cinemaId;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        skip,
        take: limit,
        include: { cinema: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.room.count({ where }),
    ]);
    const data = items.map((r) => ({
      ...r,
      cinemaName: r.cinema?.name ?? undefined,
    }));
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get('rooms/:roomId/seats')
  async getRoomSeats(@Param('roomId', ParseUuidPipe) roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        seats: { orderBy: [{ rowLabel: 'asc' }, { number: 'asc' }] },
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    return { data: room.seats };
  }

  @Put('rooms/:roomId/seats')
  async updateRoomSeats(
    @Param('roomId', ParseUuidPipe) roomId: string,
    @Body() body: { seats: Array<Record<string, unknown>> },
  ) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.seat.deleteMany({ where: { roomId } });
      if (body.seats?.length) {
        await tx.seat.createMany({
          data: body.seats.map((s) => ({
            roomId,
            rowLabel: String(s.rowLabel ?? s.row ?? ''),
            number: Number(s.number ?? 0),
            type: (s.type as 'STANDARD' | 'VIP' | 'COUPLE' | 'DISABLED') ?? 'STANDARD',
            status: (s.status as 'AVAILABLE' | 'BOOKED' | 'BLOCKED') ?? 'AVAILABLE',
            pairId: s.pairId as string | undefined,
            isAisle: Boolean(s.isAisle),
            price: s.price != null ? Number(s.price) : null,
          })),
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: { totalSeats: body.seats?.length ?? 0 },
      });
    });
    const seats = await this.prisma.seat.findMany({
      where: { roomId },
      orderBy: [{ rowLabel: 'asc' }, { number: 'asc' }],
    });
    return { data: seats };
  }

  @Post('rooms/:roomId/seats/import')
  async importRoomSeats(
    @Param('roomId', ParseUuidPipe) roomId: string,
    @Body() body: { seats: Array<Record<string, unknown>> },
  ) {
    return this.updateRoomSeats(roomId, body);
  }

  @Put('rooms/:id')
  updateRoom(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: Partial<CreateRoomDto>,
  ) {
    return this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.format !== undefined && {
          format: this.parseRoomFormat(dto.format as string),
        }),
        ...(dto.totalSeats !== undefined && { totalSeats: dto.totalSeats }),
        ...(dto.rows !== undefined && { rows: dto.rows }),
        ...(dto.columns !== undefined && { columns: dto.columns }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  @Delete('rooms/:id')
  deleteRoom(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Showtimes CRUD
  @Get('showtimes')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'date', required: false })
  async getShowtimes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
    @Query('cinemaId') cinemaId?: string,
    @Query('date') date?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (cinemaId) where.cinemaId = cinemaId;
    if (date) {
      const from = new Date(`${date}T00:00:00.000Z`);
      const to = new Date(`${date}T23:59:59.999Z`);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        where.startTime = { gte: from, lte: to };
      }
    }
    const [rawData, total] = await Promise.all([
      this.prisma.showtime.findMany({
        skip,
        take: limit,
        where,
        include: { movie: true, cinema: true, room: true },
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.showtime.count({ where }),
    ]);
    const data = rawData.map(({ movie, cinema, room, basePrice, format, ...st }) => ({
      ...st,
      basePrice: Number(basePrice),
      format: mapRoomFormat(format),
      movieTitle: movie?.title ?? null,
      moviePosterUrl: movie?.posterUrl ?? null,
      cinemaName: cinema?.name ?? null,
      roomName: room?.name ?? null,
    }));
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  @Post('showtimes')
  async createShowtime(@Body() dto: any) {
    const movieId = this.normalizeUuidInput(dto.movieId);
    const cinemaId = this.normalizeUuidInput(dto.cinemaId);
    const roomId = this.normalizeUuidInput(dto.roomId);
    if (!movieId) {
      throw new BadRequestException(
        'movieId must be a valid UUID (32 hex digits; hyphens optional)',
      );
    }
    if (!cinemaId) {
      throw new BadRequestException(
        'cinemaId must be a valid UUID (32 hex digits; fix spaces or missing characters)',
      );
    }
    if (!roomId) {
      throw new BadRequestException(
        'roomId must be a valid UUID (32 hex digits; must belong to cinema)',
      );
    }

    const start = new Date(dto.startTime);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Invalid startTime');
    }
    if (start.getTime() < Date.now() - 30_000) {
      throw new BadRequestException('Showtime startTime must be in the future');
    }
    const end = dto.endTime ? new Date(dto.endTime) : start;
    if (dto.endTime && Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'Invalid endTime; use ISO 8601 like 2026-06-01T12:30:00.000Z (hyphens, not spaces in the date)',
      );
    }

    const [movie, cinema, room] = await Promise.all([
      this.prisma.movie.findUnique({ where: { id: movieId } }),
      this.prisma.cinema.findUnique({ where: { id: cinemaId } }),
      this.prisma.room.findUnique({ where: { id: roomId } }),
    ]);
    if (!movie) {
      throw new BadRequestException('Movie not found');
    }
    if (!cinema) {
      throw new BadRequestException('Cinema not found');
    }
    if (!room) {
      throw new BadRequestException('Room not found');
    }
    if (room.cinemaId !== cinemaId) {
      throw new BadRequestException('Room does not belong to cinema');
    }

    try {
      return await this.prisma.showtime.create({
        data: {
          movieId,
          roomId,
          cinemaId,
          startTime: start,
          endTime: end,
          basePrice: dto.basePrice,
          format: this.parseRoomFormat(dto.format),
          language: dto.language,
          subtitles: dto.subtitles,
          isActive: dto.isActive ?? true,
          memberExclusive: dto.memberExclusive ?? false,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException(
          'Invalid movie, cinema, or room id (reference does not exist)',
        );
      }
      throw e;
    }
  }

  @Put('showtimes/:id')
  updateShowtime(@Param('id', ParseUuidPipe) id: string, @Body() dto: any) {
    if (dto.startTime) {
      const start = new Date(dto.startTime);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException('Invalid startTime');
      }
      if (start.getTime() < Date.now() - 30_000) {
        throw new BadRequestException('Showtime startTime must be in the future');
      }
    }
    return this.prisma.showtime.update({
      where: { id },
      data: {
        ...(dto.startTime && { startTime: new Date(dto.startTime) }),
        ...(dto.endTime && { endTime: new Date(dto.endTime) }),
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.format !== undefined && {
          format: this.parseRoomFormat(dto.format),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.memberExclusive !== undefined && { memberExclusive: dto.memberExclusive }),
      },
    });
  }

  @Delete('showtimes/:id')
  deleteShowtime(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.showtime.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Users management
  @Get('users')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          city: true,
          isActive: true,
          createdAt: true,
          userRoles: { include: { role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    const mapped = data.map((u) => ({
      ...u,
      role: u.userRoles?.[0]?.role?.name ?? 'USER',
    }));
    return { data: mapped, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  @Post('users')
  async createUser(@Body() body: any) {
    const bcrypt = await import('bcryptjs');
    const hash = body.password
      ? await bcrypt.hash(body.password, 10)
      : null;
    const user = await this.prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: hash,
        fullName: body.fullName,
        phone: body.phone,
        city: body.city,
        isActive: body.isActive ?? true,
        referralCode: generateReferralCode(),
      },
    });
    if (body.role) {
      const role = await this.prisma.role.findFirst({
        where: { name: body.role },
      });
      if (role) {
        await this.prisma.userRoleJoin.create({
          data: { userId: user.id, roleId: role.id },
        });
      }
    }
    return user;
  }

  @Put('users/:id')
  async updateUser(
    @Param('id', ParseUuidPipe) id: string,
    @Body() body: any,
  ) {
    const data: Record<string, unknown> = {};
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.email !== undefined) data.email = body.email.toLowerCase();
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.city !== undefined) data.city = body.city;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.avatar !== undefined) data.avatar = body.avatar;
    if (body.role) {
      const role = await this.prisma.role.findFirst({ where: { name: body.role } });
      if (role) {
        await this.prisma.userRoleJoin.deleteMany({ where: { userId: id } });
        await this.prisma.userRoleJoin.create({ data: { userId: id, roleId: role.id } });
      }
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: data as any,
      include: { userRoles: { include: { role: true } } },
    });
    return {
      ...updated,
      role: updated.userRoles?.[0]?.role?.name ?? 'USER',
    };
  }

  @Put('users/:id/toggle-active')
  toggleUserActive(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      return tx.user.update({
        where: { id },
        data: { isActive: !user.isActive },
      });
    });
  }

  @Delete('users/:id')
  async deleteUser(@Param('id', ParseUuidPipe) id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'User deactivated' };
  }

  // Bookings management
  @Get('bookings/recent')
  @ApiQuery({ name: 'limit', required: false })
  async recentBookings(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const raw = await this.prisma.booking.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        showtime: { include: { movie: true, cinema: true, room: true } },
      },
    });
    return raw.map(({ showtime, totalAmount, finalAmount, ...b }) => ({
      ...b,
      totalAmount: Number(totalAmount),
      finalAmount: Number(finalAmount),
      movieTitle: showtime?.movie?.title ?? null,
      moviePosterUrl: showtime?.movie?.posterUrl ?? null,
      cinemaName: showtime?.cinema?.name ?? null,
      roomName: showtime?.room?.name ?? null,
      showtime: showtime?.startTime?.toISOString() ?? null,
      format: showtime ? mapRoomFormat(showtime.format) : null,
    }));
  }

  @Get('bookings')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getBookings(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const skip = (page - 1) * limit;
    const and: Record<string, unknown>[] = [];
    if (status) and.push({ status: status as any });
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) {
        const d = new Date(`${from}T00:00:00.000Z`);
        if (!Number.isNaN(d.getTime())) createdAt.gte = d;
      }
      if (to) {
        const d = new Date(`${to}T23:59:59.999Z`);
        if (!Number.isNaN(d.getTime())) createdAt.lte = d;
      }
      if (Object.keys(createdAt).length > 0) and.push({ createdAt });
    }
    if (search) {
      and.push({
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { user: { fullName: { contains: search, mode: 'insensitive' } } },
          { showtime: { movie: { title: { contains: search, mode: 'insensitive' } } } },
          { showtime: { cinema: { name: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length > 0 ? { AND: and } : {};
    const [rawData, total] = await Promise.all([
      this.prisma.booking.findMany({
        skip,
        take: limit,
        where,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          showtime: { include: { movie: true, cinema: true, room: true } },
          bookingItems: { include: { seat: true } },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);
    const data = rawData.map(({ showtime, totalAmount, ...b }) => ({
      ...b,
      totalAmount: Number(totalAmount),
      movieTitle: showtime?.movie?.title ?? null,
      cinemaName: showtime?.cinema?.name ?? null,
      roomName: showtime?.room?.name ?? null,
      showtime: showtime ? {
        ...showtime,
        basePrice: Number(showtime.basePrice),
        format: mapRoomFormat(showtime.format),
      } : null,
    }));
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  @Post('bookings/:id/cancel')
  async cancelBooking(@Param('id', ParseUuidPipe) id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.bookingsService.cancel(id, booking.userId);
  }

  @Post('bookings/:id/refund')
  async refundBooking(@Param('id', ParseUuidPipe) id: string) {
    return this.bookingsService.adminRefund(id, 'Admin refund');
  }

  @Get('reports/sales')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async salesReport(@Query('from') from?: string, @Query('to') to?: string) {
    const dateFrom = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      select: { finalAmount: true, createdAt: true },
    });

    const byDate = new Map<string, { revenue: number; bookings: number }>();
    for (const b of bookings) {
      const k = this.toDateKey(b.createdAt);
      const prev = byDate.get(k) ?? { revenue: 0, bookings: 0 };
      prev.revenue += Number(b.finalAmount ?? 0);
      prev.bookings += 1;
      byDate.set(k, prev);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, revenue: v.revenue, bookings: v.bookings }));
  }

  @Get('reports/movies')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async moviesReport(@Query('from') from?: string, @Query('to') to?: string) {
    const dateFrom = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const movies = await this.prisma.movie.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        title: true,
        posterUrl: true,
        showtimes: {
          where: { startTime: { gte: dateFrom, lte: dateTo } },
          select: {
            bookings: {
              where: { status: 'CONFIRMED' },
              select: {
                finalAmount: true,
                bookingItems: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    return movies
      .map((m) => {
        const allBookings = m.showtimes.flatMap((s) => s.bookings);
        const revenue = allBookings.reduce(
          (s, b) => s + Number(b.finalAmount ?? 0),
          0,
        );
        const tickets = allBookings.reduce(
          (s, b) => s + b.bookingItems.length,
          0,
        );
        return {
          movieId: m.id,
          movieTitle: m.title,
          posterUrl: m.posterUrl,
          bookings: allBookings.length,
          ticketCount: tickets,
          revenue,
          occupancy: 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  @Get('reports/cinemas')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async cinemasReport(@Query('from') from?: string, @Query('to') to?: string) {
    const dateFrom = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    const cinemas = await this.prisma.cinema.findMany({
      select: {
        id: true,
        name: true,
        city: true,
        showtimes: {
          where: { startTime: { gte: dateFrom, lte: dateTo } },
          select: {
            bookings: {
              where: { status: 'CONFIRMED' },
              select: {
                finalAmount: true,
                bookingItems: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    return cinemas
      .map((c) => {
        const allBookings = c.showtimes.flatMap((s) => s.bookings);
        const revenue = allBookings.reduce(
          (s, b) => s + Number(b.finalAmount ?? 0),
          0,
        );
        const tickets = allBookings.reduce(
          (s, b) => s + b.bookingItems.length,
          0,
        );
        return {
          cinemaId: c.id,
          cinemaName: c.name,
          city: c.city,
          bookings: allBookings.length,
          ticketCount: tickets,
          revenue,
          occupancy: 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Promotions CRUD
  @Get('promotions')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPromotions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.promotion.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.promotion.count(),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  @Post('promotions')
  createPromotion(@Body() dto: any) {
    return this.prisma.promotion.create({
      data: {
        title: dto.title,
        description: dto.description,
        code: dto.code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minPurchase: dto.minPurchase,
        maxDiscount: dto.maxDiscount,
        usageLimit: dto.usageLimit,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        imageUrl: dto.imageUrl,
        conditions: dto.conditions,
        status: dto.status ?? 'ACTIVE',
        isTrending: dto.isTrending ?? false,
      },
    });
  }

  @Put('promotions/:id')
  updatePromotion(@Param('id', ParseUuidPipe) id: string, @Body() dto: any) {
    return this.prisma.promotion.update({ where: { id }, data: dto });
  }

  @Delete('promotions/:id')
  deletePromotion(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.promotion.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  // Pricing rules CRUD
  @Get('pricing-rules')
  getPricingRules() {
    return this.prisma.pricingRule.findMany({
      include: { cinema: true },
      orderBy: { createdAt: 'desc' },
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        roomFormat: r.format ? mapRoomFormat(r.format) : null,
      })),
    );
  }

  @Post('pricing-rules')
  createPricingRule(@Body() dto: any) {
    return this.prisma.pricingRule.create({
      data: {
        name: dto.name,
        cinemaId: dto.cinemaId,
        seatType: dto.seatType,
        format: this.parseRoomFormat(dto.roomFormat ?? dto.format),
        dayType: dto.dayType,
        timeSlot: dto.timeSlot,
        isHoliday: dto.isHoliday ?? false,
        price: dto.price,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Put('pricing-rules/:id')
  updatePricingRule(@Param('id', ParseUuidPipe) id: string, @Body() dto: any) {
    return this.prisma.pricingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.cinemaId !== undefined && { cinemaId: dto.cinemaId }),
        ...(dto.seatType !== undefined && { seatType: dto.seatType }),
        ...((dto.roomFormat !== undefined || dto.format !== undefined) && {
          format: this.parseRoomFormat(dto.roomFormat ?? dto.format),
        }),
        ...(dto.dayType !== undefined && { dayType: dto.dayType }),
        ...(dto.timeSlot !== undefined && { timeSlot: dto.timeSlot }),
        ...(dto.isHoliday !== undefined && { isHoliday: dto.isHoliday }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  @Delete('pricing-rules/:id')
  deletePricingRule(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.pricingRule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  @Get('roles')
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
    return roles;
  }

  @Put('roles/:id')
  async updateRolePermissions(
    @Param('id', ParseUuidPipe) id: string,
    @Body() body: { permissions?: string[] },
  ) {
    const permissions = Array.isArray(body.permissions)
      ? body.permissions
          .map((p) => String(p).trim())
          .filter((p) => p.length > 0)
      : [];
    return this.prisma.role.update({
      where: { id },
      data: { permissions: permissions as object },
    });
  }

  // ─── News (ADMIN only) ─────────────────────────────────────────────
  private normalizeJsonArray(v: Prisma.JsonValue | null | undefined): string[] | undefined {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v.map((x) => String(x));
    return undefined;
  }

  private toNewsAdminRow(article: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    category: NewsCategory;
    imageUrl: string | null;
    author: string;
    tags: Prisma.JsonValue;
    relatedArticleIds: Prisma.JsonValue;
    publishedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      category: article.category,
      imageUrl: article.imageUrl ?? undefined,
      author: article.author,
      tags: this.normalizeJsonArray(article.tags),
      relatedArticleIds: this.normalizeJsonArray(article.relatedArticleIds),
      publishedAt: article.publishedAt.toISOString(),
      createdAt: article.createdAt.toISOString(),
    };
  }

  @Get('news')
  @Roles(UserRole.ADMIN)
  async listNewsAdmin(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.newsArticle.count(),
    ]);
    return {
      data: items.map((a) => this.toNewsAdminRow(a)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  @Post('news')
  @Roles(UserRole.ADMIN)
  async createNewsAdmin(@Body() dto: CreateNewsArticleAdminDto) {
    const dup = await this.prisma.newsArticle.findUnique({ where: { slug: dto.slug } });
    if (dup) throw new ConflictException('Slug already in use');
    const created = await this.prisma.newsArticle.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        excerpt: dto.excerpt,
        content: dto.content,
        category: dto.category,
        imageUrl: dto.imageUrl ?? null,
        author: dto.author,
        tags: (dto.tags ?? []) as Prisma.InputJsonValue,
        relatedArticleIds: (dto.relatedArticleIds ?? []) as Prisma.InputJsonValue,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
      },
    });
    return { data: this.toNewsAdminRow(created) };
  }

  @Put('news/:id')
  @Roles(UserRole.ADMIN)
  async updateNewsAdmin(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateNewsArticleAdminDto,
  ) {
    if (dto.slug) {
      const clash = await this.prisma.newsArticle.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (clash) throw new ConflictException('Slug already in use');
    }
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.author !== undefined && { author: dto.author }),
        ...(dto.tags !== undefined && { tags: dto.tags as Prisma.InputJsonValue }),
        ...(dto.relatedArticleIds !== undefined && {
          relatedArticleIds: dto.relatedArticleIds as Prisma.InputJsonValue,
        }),
        ...(dto.publishedAt !== undefined && { publishedAt: new Date(dto.publishedAt) }),
      },
    });
    return { data: this.toNewsAdminRow(updated) };
  }

  @Delete('news/:id')
  @Roles(UserRole.ADMIN)
  async deleteNewsAdmin(@Param('id', ParseUuidPipe) id: string) {
    await this.prisma.newsArticle.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ─── Campaigns (ADMIN only) ───────────────────────────────────────
  @Get('campaigns')
  @Roles(UserRole.ADMIN)
  async listCampaignsAdmin() {
    const rows = await this.prisma.campaign.findMany({
      include: { banners: true },
      orderBy: { startDate: 'desc' },
    });
    return {
      data: rows.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        description: c.description ?? '',
        content: c.content ?? '',
        imageUrl: c.imageUrl ?? undefined,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        isActive: c.isActive,
        metadata: c.metadata,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        banners: (c.banners ?? []).map((b) => ({
          id: b.id,
          title: b.title ?? undefined,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl ?? undefined,
          position: b.position,
          sortOrder: b.sortOrder,
          isActive: b.isActive,
          campaignId: b.campaignId ?? undefined,
          startDate: b.startDate?.toISOString(),
          endDate: b.endDate?.toISOString(),
          createdAt: b.createdAt.toISOString(),
        })),
      })),
    };
  }

  @Post('campaigns')
  @Roles(UserRole.ADMIN)
  async createCampaignAdmin(@Body() dto: CreateCampaignAdminDto) {
    const dup = await this.prisma.campaign.findUnique({ where: { slug: dto.slug } });
    if (dup) throw new ConflictException('Campaign slug already in use');
    const c = await this.prisma.campaign.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description ?? null,
        content: dto.content ?? null,
        imageUrl: dto.imageUrl ?? null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isActive: dto.isActive ?? true,
        metadata: {},
      },
    });
    return { data: { id: c.id, slug: c.slug, title: c.title } };
  }

  @Put('campaigns/:id')
  @Roles(UserRole.ADMIN)
  async updateCampaignAdmin(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateCampaignAdminDto,
  ) {
    if (dto.slug) {
      const clash = await this.prisma.campaign.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (clash) throw new ConflictException('Campaign slug already in use');
    }
    await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return { message: 'Updated' };
  }

  @Delete('campaigns/:id')
  @Roles(UserRole.ADMIN)
  async deleteCampaignAdmin(@Param('id', ParseUuidPipe) id: string) {
    await this.prisma.campaign.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Deactivated' };
  }

  // ─── Banners (ADMIN only) ─────────────────────────────────────────
  @Get('banners')
  @Roles(UserRole.ADMIN)
  async listBannersAdmin() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
    return {
      data: rows.map((b) => ({
        id: b.id,
        title: b.title ?? undefined,
        imageUrl: b.imageUrl,
        linkUrl: b.linkUrl ?? undefined,
        position: b.position,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
        campaignId: b.campaignId ?? undefined,
        startDate: b.startDate?.toISOString(),
        endDate: b.endDate?.toISOString(),
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  @Post('banners')
  @Roles(UserRole.ADMIN)
  async createBannerAdmin(@Body() dto: CreateBannerAdminDto) {
    const b = await this.prisma.banner.create({
      data: {
        title: dto.title ?? null,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        position: dto.position ?? 'home',
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        campaignId: dto.campaignId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    return { data: { id: b.id } };
  }

  @Put('banners/:id')
  @Roles(UserRole.ADMIN)
  async updateBannerAdmin(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateBannerAdminDto,
  ) {
    await this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.campaignId !== undefined && {
          campaignId: dto.campaignId === '' ? null : dto.campaignId,
        }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
    });
    return { message: 'Updated' };
  }

  @Delete('banners/:id')
  @Roles(UserRole.ADMIN)
  async deleteBannerAdmin(@Param('id', ParseUuidPipe) id: string) {
    await this.prisma.banner.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  @Post('provinces/sync')
  @Roles(UserRole.ADMIN)
  syncProvinces() {
    return this.provincesSyncService.syncWithLog();
  }

  @Get('community/pending')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  pendingCommunityContent() {
    return this.communityService.adminPendingContent();
  }

  @Post('community/reviews/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  approveReview(@Param('id', ParseUuidPipe) id: string) {
    return this.communityService.approveReview(id);
  }

  @Post('community/posts/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  approvePost(@Param('id', ParseUuidPipe) id: string) {
    return this.communityService.approvePost(id);
  }

  @Post('community/photos/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  approvePhoto(@Param('id', ParseUuidPipe) id: string) {
    return this.communityService.approvePhoto(id);
  }

  @Get('support/tickets')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listSupportTickets(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportTicket.count(),
    ]);
    return { data: items, meta: { page, limit, total } };
  }
}
