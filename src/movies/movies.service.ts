import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PageMeta } from '../common/dto/page-meta.dto';
import { MovieStatus, Prisma } from '@prisma/client';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: MovieStatus;
    search?: string;
    genre?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.MovieWhereInput = {
      isDeleted: false,
    };

    if (params.status) {
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
            ],
          },
        },
      };
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        skip,
        take: limit,
        include: {
          movieGenres: { include: { genre: true } },
        },
        orderBy: { releaseDate: 'desc' },
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
    return { data: items, meta };
  }

  async findBySlug(slug: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { slug, isDeleted: false },
      include: {
        movieGenres: { include: { genre: true } },
      },
    });
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }
    const { movieGenres, rating, castMembers, ...m } = movie;
    return {
      ...m,
      genres: movieGenres.map((mg) => mg.genre),
      cast: castMembers ?? [],
      rating: rating ? Number(rating) : null,
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
    return { data: items, meta };
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

    return this.prisma.review.findUnique({
      where: { id: review.id },
      include: {
        user: {
          select: { id: true, fullName: true, avatar: true },
        },
      },
    });
  }
}
