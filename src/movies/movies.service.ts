import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PageMeta } from '../common/dto/page-meta.dto';
import { MovieStatus, Prisma, AgeRating } from '@prisma/client';
import { ProvinceResolverService } from '../provinces/province-resolver.service';
@Injectable()
export class MoviesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinceResolver: ProvinceResolverService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: MovieStatus;
    nowShowing?: boolean;
    comingSoon?: boolean;
    search?: string;
    genre?: string;
    language?: string;
    ageRating?: AgeRating;
    durationMin?: number;
    durationMax?: number;
    format?: string;
    sort?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.MovieWhereInput = {
      isDeleted: false,
    };

    if (params.nowShowing) {
      where.status = MovieStatus.NOW_SHOWING;
    } else if (params.comingSoon) {
      where.status = MovieStatus.COMING_SOON;
    } else if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { originalTitle: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.genre) {
      where.movieGenres = {
        some: {
          genre: {
            OR: [
              { id: params.genre },
              { slug: params.genre },
              { name: { contains: params.genre, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    if (params.language) {
      where.language = { contains: params.language, mode: 'insensitive' };
    }

    if (params.ageRating) {
      where.ageRating = params.ageRating;
    }

    if (params.durationMin !== undefined || params.durationMax !== undefined) {
      where.duration = {
        ...(params.durationMin !== undefined ? { gte: params.durationMin } : {}),
        ...(params.durationMax !== undefined ? { lte: params.durationMax } : {}),
      };
    }

    if (params.format) {
      where.formats = { array_contains: [params.format] };
    }

    const sortKey = (params.sort || '').toLowerCase();
    const defaultSort = params.comingSoon
      ? { releaseDate: 'asc' as const }
      : { releaseDate: 'desc' as const };
    const orderBy: Prisma.MovieOrderByWithRelationInput = (() => {
      switch (sortKey) {
        case 'releasedate:asc':
          return { releaseDate: 'asc' };
        case 'title:asc':
          return { title: 'asc' };
        case 'title:desc':
          return { title: 'desc' };
        case 'rating:asc':
          return { rating: 'asc' };
        case 'rating:desc':
          return { rating: 'desc' };
        case 'releasedate:desc':
          return { releaseDate: 'desc' };
        default:
          return defaultSort;
      }
    })();

    const [rawItems, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        skip,
        take: limit,
        include: {
          movieGenres: { include: { genre: true } },
        },
        orderBy,
      }),
      this.prisma.movie.count({ where }),
    ]);

    const items = rawItems.map(({ movieGenres, rating, castMembers, ...m }) => ({
      ...m,
      genres: movieGenres.map((mg) => mg.genre),
      cast: castMembers ?? [],
      rating: rating ? Number(rating) : null,
    }));

    const meta = new PageMeta(page, limit, total);
    return { data: items.map((m) => this.toResponse(m)), meta };
  }

  async findBySlug(slug: string) {
    // Frontend routes may pass either a slug or a UUID id.
    // To keep backward compatibility, try id first then slug.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);

    if (isUuid) {
      const byId = await this.prisma.movie.findFirst({
        where: { id: slug, isDeleted: false },
        include: {
          movieGenres: { include: { genre: true } },
        },
      });
      if (byId) return this.toResponse(byId);
    }

    const movie = await this.prisma.movie.findFirst({
      where: { slug, isDeleted: false },
      include: {
        movieGenres: { include: { genre: true } },
      },
    });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    return this.toResponse(movie);
  }

  private toResponse(movie: any) {
    const { movieGenres, castMembers, rating, isDeleted, ...rest } = movie;
    return {
      ...rest,
      rating: typeof rating === 'object' && rating !== null ? Number(rating) : Number(rating ?? 0),
      genres: movieGenres?.map((mg: any) => mg.genre) ?? [],
      cast: Array.isArray(castMembers)
        ? castMembers.map((name: string) => ({ name, role: 'Actor', avatarUrl: null }))
        : [],
    };
  }

  async findReviews(movieId: string, page = 1, limit = 10) {
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId, isDeleted: false },
    });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { movieId },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, fullName: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.count({ where: { movieId } }),
    ]);

    const meta = new PageMeta(page, limit, total);
    return { data: items.map((r) => this.reviewToResponse(r)), meta };
  }

  private reviewToResponse(
    review: {
      id: string;
      userId: string;
      movieId: string;
      rating: number;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      user?: { id: string; fullName: string; avatar: string | null } | null;
    },
  ) {
    const u = review.user;
    return {
      id: review.id,
      userId: review.userId,
      movieId: review.movieId,
      rating: review.rating,
      content: review.content,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      userName: u?.fullName?.trim() || 'User',
      userAvatar: u?.avatar ?? undefined,
    };
  }

  async createReview(movieId: string, userId: string, dto: CreateReviewDto) {
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId, isDeleted: false },
    });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    const existing = await this.prisma.review.findUnique({
      where: {
        userId_movieId: { userId, movieId },
      },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this movie');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          movieId,
          userId,
          rating: dto.rating,
          content: dto.content,
        },
      });

      const agg = await tx.review.aggregate({
        where: { movieId },
        _avg: { rating: true },
        _count: true,
      });

      await tx.movie.update({
        where: { id: movieId },
        data: {
          rating: agg._avg.rating ?? 0,
          ratingCount: agg._count,
        },
      });

      return r;
    });

    const created = await this.prisma.review.findUnique({
      where: { id: review.id },
      include: {
        user: {
          select: { id: true, fullName: true, avatar: true },
        },
      },
    });
    if (!created) {
      throw new NotFoundException('Review not found');
    }
    return this.reviewToResponse(created);
  }

  async findShowtimesByMovie(movieId: string, date?: string, city?: string) {
    const where: Prisma.ShowtimeWhereInput = { movieId, isActive: true };
    if (date) {
      const d = new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.startTime = { gte: start, lte: end };
    }
    const provinceCode = await this.provinceResolver.resolveToNewCode(city);
    if (provinceCode) {
      where.cinema = { provinceNew: { code: provinceCode } };
    }
    return this.prisma.showtime.findMany({
      where,
      include: {
        movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
        room: { select: { id: true, name: true, format: true } },
        cinema: { select: { id: true, name: true, slug: true, address: true, city: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }
}
