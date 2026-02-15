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
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { UserRole } from '@prisma/client';
import { mapRoomFormat } from '../common/helpers/format.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovieDto } from '../movies/dto/create-movie.dto';
import { UpdateMovieDto } from '../movies/dto/update-movie.dto';
import { CreateCinemaDto } from '../cinemas/dto/create-cinema.dto';
import { UpdateCinemaDto } from '../cinemas/dto/update-cinema.dto';
import { CreateRoomDto } from '../cinemas/dto/create-room.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('audit-logs')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'userId', required: false })
  getAuditLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getAuditLogs(page, limit, entityType, userId);
  }

  // Movies CRUD
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
        format: dto.format ?? 'STANDARD2D',
        totalSeats: dto.totalSeats ?? 0,
        rows: dto.rows ?? 0,
        columns: dto.columns ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
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
        ...(dto.format && { format: dto.format }),
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
  async getShowtimes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [rawData, total] = await Promise.all([
      this.prisma.showtime.findMany({
        skip,
        take: limit,
        include: { movie: true, cinema: true, room: true },
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.showtime.count(),
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
  createShowtime(@Body() dto: any) {
    return this.prisma.showtime.create({
      data: {
        movieId: dto.movieId,
        roomId: dto.roomId,
        cinemaId: dto.cinemaId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        basePrice: dto.basePrice,
        format: dto.format ?? 'STANDARD2D',
        language: dto.language,
        subtitles: dto.subtitles,
        isActive: dto.isActive ?? true,
        memberExclusive: dto.memberExclusive ?? false,
      },
    });
  }

  @Put('showtimes/:id')
  updateShowtime(@Param('id', ParseUuidPipe) id: string, @Body() dto: any) {
    return this.prisma.showtime.update({
      where: { id },
      data: {
        ...(dto.startTime && { startTime: new Date(dto.startTime) }),
        ...(dto.endTime && { endTime: new Date(dto.endTime) }),
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.format && { format: dto.format }),
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
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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

  // Bookings management
  @Get('bookings')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getBookings(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = status ? { status: status as any } : {};
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
    });
  }

  @Post('pricing-rules')
  createPricingRule(@Body() dto: any) {
    return this.prisma.pricingRule.create({
      data: {
        name: dto.name,
        cinemaId: dto.cinemaId,
        seatType: dto.seatType,
        format: dto.format,
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
    return this.prisma.pricingRule.update({ where: { id }, data: dto });
  }

  @Delete('pricing-rules/:id')
  deletePricingRule(@Param('id', ParseUuidPipe) id: string) {
    return this.prisma.pricingRule.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
