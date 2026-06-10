import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BookingStatus,
  CommunityPostType,
  NotificationType,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageMeta } from '../common/dto/page-meta.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { containsProfanity, generateInviteToken } from './community.utils';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CreateCinemaPhotoDto } from './dto/create-cinema-photo.dto';
import { VotePollDto } from './dto/vote-poll.dto';

const REVIEW_CHALLENGE_POINTS = 30;
const REVIEW_CHALLENGE_TARGET = 3;

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        memberships: { include: { tier: true }, take: 1 },
        _count: { select: { reviews: true, bookings: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.profilePublic && userId !== viewerId) {
      throw new ForbiddenException('This profile is private');
    }

    const tier = user.memberships[0]?.tier?.name ?? 'Bronze';
    const recentReviews = await this.prisma.review.findMany({
      where: { userId, isApproved: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { movie: { select: { id: true, title: true, slug: true, posterUrl: true } } },
    });

    return {
      id: user.id,
      fullName: user.fullName,
      avatar: user.avatar,
      city: user.city,
      membershipTier: tier,
      reviewCount: user._count.reviews,
      bookingCount: user._count.bookings,
      memberSince: user.createdAt,
      recentReviews: recentReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        content: r.content,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
        movie: r.movie,
      })),
      isOwnProfile: viewerId === userId,
    };
  }

  async getWatchlist(userId: string) {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        movie: {
          select: {
            id: true,
            title: true,
            slug: true,
            posterUrl: true,
            status: true,
            releaseDate: true,
            rating: true,
          },
        },
      },
    });
    return {
      data: items.map((i) => ({
        id: i.id,
        movieId: i.movieId,
        notifyWhenAvailable: i.notifyWhenAvailable,
        createdAt: i.createdAt,
        movie: {
          ...i.movie,
          rating: i.movie.rating ? Number(i.movie.rating) : null,
        },
      })),
    };
  }

  async addWatchlist(userId: string, movieId: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, isDeleted: false },
    });
    if (!movie) throw new NotFoundException('Movie not found');
    try {
      await this.prisma.watchlistItem.create({ data: { userId, movieId } });
    } catch {
      throw new ConflictException('Movie already in watchlist');
    }
    return { message: 'Added to watchlist' };
  }

  async removeWatchlist(userId: string, movieId: string) {
    await this.prisma.watchlistItem.deleteMany({ where: { userId, movieId } });
    return { message: 'Removed from watchlist' };
  }

  async findGlobalReviews(page = 1, limit = 20, verifiedOnly = true) {
    const skip = (page - 1) * limit;
    const where = { isApproved: true, ...(verifiedOnly ? { isVerified: true } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
          movie: { select: { id: true, title: true, slug: true, posterUrl: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: items.map((r) => this.reviewRow(r)),
      meta: new PageMeta(page, limit, total),
    };
  }

  async toggleReviewReaction(reviewId: string, userId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review || !review.isApproved) {
      throw new NotFoundException('Review not found');
    }
    const existing = await this.prisma.reviewReaction.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.reviewReaction.delete({ where: { id: existing.id } }),
        this.prisma.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { decrement: 1 } },
        }),
      ]);
      return { liked: false, helpfulCount: Math.max(0, review.helpfulCount - 1) };
    }
    await this.prisma.$transaction([
      this.prisma.reviewReaction.create({ data: { reviewId, userId } }),
      this.prisma.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { increment: 1 } },
      }),
    ]);
    return { liked: true, helpfulCount: review.helpfulCount + 1 };
  }

  async getReviewReactionsForUser(reviewIds: string[], userId?: string) {
    if (!userId || reviewIds.length === 0) return {};
    const rows = await this.prisma.reviewReaction.findMany({
      where: { reviewId: { in: reviewIds }, userId },
      select: { reviewId: true },
    });
    return Object.fromEntries(rows.map((r) => [r.reviewId, true]));
  }

  async createGroupInvite(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: BookingStatus.CONFIRMED },
      include: {
        showtime: { include: { movie: true, cinema: true } },
        bookingItems: true,
      },
    });
    if (!booking) throw new NotFoundException('Confirmed booking not found');

    const existing = await this.prisma.bookingGroupInvite.findUnique({
      where: { bookingId },
    });
    if (existing) {
      return this.groupInviteResponse(existing, booking);
    }

    const expiresAt = booking.showtime.startTime;
    const invite = await this.prisma.bookingGroupInvite.create({
      data: {
        bookingId,
        hostUserId: userId,
        token: generateInviteToken(),
        expiresAt,
      },
    });
    return this.groupInviteResponse(invite, booking);
  }

  async getGroupInviteByToken(token: string) {
    const invite = await this.prisma.bookingGroupInvite.findUnique({
      where: { token },
      include: {
        booking: {
          include: {
            showtime: {
              include: {
                movie: { select: { id: true, title: true, slug: true, posterUrl: true } },
                cinema: { select: { id: true, name: true, address: true, city: true } },
              },
            },
            bookingItems: {
              select: { rowLabel: true, seatNumber: true, seatType: true },
            },
            user: { select: { fullName: true } },
          },
        },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite expired');
    }
    const b = invite.booking;
    return {
      token: invite.token,
      showtimeId: b.showtimeId,
      movie: b.showtime.movie,
      cinema: b.showtime.cinema,
      startTime: b.showtime.startTime,
      hostName: b.user.fullName,
      seats: b.bookingItems.map((s) => `${s.rowLabel}${s.seatNumber}`),
      bookingUrl: `/booking/${b.showtimeId}`,
    };
  }

  async listPosts(page = 1, limit = 20, movieId?: string) {
    const skip = (page - 1) * limit;
    const where = { isApproved: true, ...(movieId ? { movieId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
          movie: { select: { id: true, title: true, slug: true } },
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);
    return { data: items.map((p) => this.postRow(p)), meta: new PageMeta(page, limit, total) };
  }

  async createPost(userId: string, dto: CreateCommunityPostDto) {
    const isApproved = !containsProfanity(dto.content);
    const pollOptions =
      dto.type === CommunityPostType.POLL && dto.pollOptions?.length
        ? dto.pollOptions.map((label, i) => ({
            id: `opt-${i + 1}`,
            label,
            votes: 0,
          }))
        : undefined;

    const post = await this.prisma.communityPost.create({
      data: {
        userId,
        movieId: dto.movieId,
        content: dto.content.trim(),
        hashtags: dto.hashtags ?? [],
        type: dto.type ?? CommunityPostType.DISCUSSION,
        pollOptions,
        isApproved,
      },
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
        movie: { select: { id: true, title: true, slug: true } },
      },
    });
    return this.postRow(post);
  }

  async votePoll(postId: string, userId: string, dto: VotePollDto) {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, type: CommunityPostType.POLL, isApproved: true },
    });
    if (!post) throw new NotFoundException('Poll not found');
    const options = (post.pollOptions as { id: string; label: string; votes: number }[]) ?? [];
    if (!options.some((o) => o.id === dto.optionId)) {
      throw new BadRequestException('Invalid poll option');
    }
    try {
      await this.prisma.communityPollVote.create({
        data: { postId, userId, optionId: dto.optionId },
      });
    } catch {
      throw new ConflictException('You already voted on this poll');
    }
    const updated = options.map((o) =>
      o.id === dto.optionId ? { ...o, votes: o.votes + 1 } : o,
    );
    await this.prisma.communityPost.update({
      where: { id: postId },
      data: { pollOptions: updated },
    });
    return { pollOptions: updated };
  }

  async listPhotos(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { isApproved: true };
    const [items, total] = await Promise.all([
      this.prisma.cinemaPhoto.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
          movie: { select: { id: true, title: true, slug: true } },
        },
      }),
      this.prisma.cinemaPhoto.count({ where }),
    ]);
    return { data: items, meta: new PageMeta(page, limit, total) };
  }

  async createPhoto(userId: string, dto: CreateCinemaPhotoDto) {
    const isApproved = !containsProfanity(dto.caption ?? '');
    const photo = await this.prisma.cinemaPhoto.create({
      data: {
        userId,
        bookingId: dto.bookingId,
        movieId: dto.movieId,
        imageUrl: dto.imageUrl,
        caption: dto.caption?.trim(),
        isApproved,
      },
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
        movie: { select: { id: true, title: true, slug: true } },
      },
    });
    return photo;
  }

  async adminPendingContent() {
    const [reviews, posts, photos] = await Promise.all([
      this.prisma.review.findMany({
        where: { isApproved: false },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } }, movie: { select: { title: true } } },
      }),
      this.prisma.communityPost.findMany({
        where: { isApproved: false },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.cinemaPhoto.findMany({
        where: { isApproved: false },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
    ]);
    return { reviews, posts, photos };
  }

  async approveReview(id: string) {
    const review = await this.prisma.review.update({
      where: { id },
      data: { isApproved: true },
    });
    await this.recalcMovieRating(review.movieId);
    return { message: 'Review approved' };
  }

  async approvePost(id: string) {
    await this.prisma.communityPost.update({ where: { id }, data: { isApproved: true } });
    return { message: 'Post approved' };
  }

  async approvePhoto(id: string) {
    await this.prisma.cinemaPhoto.update({ where: { id }, data: { isApproved: true } });
    return { message: 'Photo approved' };
  }

  async rejectReview(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    await this.prisma.review.delete({ where: { id } });
    await this.recalcMovieRating(review.movieId);
    return { message: 'Review rejected' };
  }

  async rejectPost(id: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    await this.prisma.communityPost.delete({ where: { id } });
    return { message: 'Post rejected' };
  }

  async rejectPhoto(id: string) {
    const photo = await this.prisma.cinemaPhoto.findUnique({ where: { id } });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    await this.prisma.cinemaPhoto.delete({ where: { id } });
    return { message: 'Photo rejected' };
  }

  async adminCommunityStats() {
    const [pendingReviews, openTickets, totalRefunds, verifiedReviews] = await Promise.all([
      this.prisma.review.count({ where: { isApproved: false } }),
      this.prisma.supportTicket.count({ where: { isResolved: false } }),
      this.prisma.bookingRefund.count(),
      this.prisma.review.count({ where: { isApproved: true, isVerified: true } }),
    ]);
    return { pendingReviews, openTickets, totalRefunds, verifiedReviews };
  }

  async checkReviewChallenge(userId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const count = await this.prisma.review.count({
      where: { userId, createdAt: { gte: startOfMonth } },
    });
    if (count < REVIEW_CHALLENGE_TARGET) return;

    const already = await this.prisma.pointsHistory.findFirst({
      where: {
        userId,
        description: 'Review challenge bonus',
        createdAt: { gte: startOfMonth },
      },
    });
    if (already) return;

    const membership = await this.prisma.membership.findUnique({ where: { userId } });
    if (!membership) return;

    const newPoints = membership.currentPoints + REVIEW_CHALLENGE_POINTS;
    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { id: membership.id },
        data: { currentPoints: newPoints, totalPoints: { increment: REVIEW_CHALLENGE_POINTS } },
      }),
      this.prisma.pointsHistory.create({
        data: {
          userId,
          type: 'EARNED',
          points: REVIEW_CHALLENGE_POINTS,
          balance: newPoints,
          description: 'Review challenge bonus',
        },
      }),
    ]);
    await this.notifications.create(userId, {
      type: NotificationType.MEMBERSHIP,
      title: 'Review challenge complete',
      message: `You reviewed ${REVIEW_CHALLENGE_TARGET} films this month and earned ${REVIEW_CHALLENGE_POINTS} points.`,
      link: '/account/profile',
    });
  }

  async recalcMovieRating(movieId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { movieId, isApproved: true },
      select: { rating: true, isVerified: true },
    });
    let weightedSum = 0;
    let totalWeight = 0;
    for (const r of reviews) {
      const w = r.isVerified ? 2 : 1;
      weightedSum += r.rating * w;
      totalWeight += w;
    }
    await this.prisma.movie.update({
      where: { id: movieId },
      data: {
        rating: totalWeight > 0 ? weightedSum / totalWeight : 0,
        ratingCount: reviews.length,
      },
    });
  }

  async userHasConfirmedBooking(userId: string, movieId: string): Promise<boolean> {
    const paid = await this.prisma.booking.findFirst({
      where: {
        userId,
        status: BookingStatus.CONFIRMED,
        showtime: { movieId },
        payments: { some: { status: PaymentStatus.PAID } },
      },
    });
    return !!paid;
  }

  async userHasVerifiedTicket(userId: string, movieId: string): Promise<boolean> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId,
        status: BookingStatus.CONFIRMED,
        showtime: { movieId },
        payments: { some: { status: PaymentStatus.PAID } },
      },
      include: {
        showtime: { include: { movie: { select: { duration: true } } } },
      },
    });
    const now = Date.now();
    return bookings.some((b) => {
      const start = b.showtime.startTime.getTime();
      const durationMin = b.showtime.movie.duration ?? 120;
      return start + durationMin * 60 * 1000 <= now;
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendPostShowReviewPrompts() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const prompted = await this.prisma.postShowPrompt.findMany({
      select: { bookingId: true },
    });
    const promptedIds = prompted.map((p) => p.bookingId);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        id: { notIn: promptedIds.length ? promptedIds : ['00000000-0000-0000-0000-000000000000'] },
        showtime: { startTime: { lte: twoHoursAgo, gte: threeHoursAgo } },
      },
      include: { showtime: { include: { movie: true } } },
      take: 100,
    });

    for (const b of bookings) {
      const movie = b.showtime.movie;
      const existingReview = await this.prisma.review.findUnique({
        where: { userId_movieId: { userId: b.userId, movieId: movie.id } },
      });
      if (existingReview) continue;

      await this.prisma.postShowPrompt.create({
        data: { bookingId: b.id, userId: b.userId, movieId: movie.id },
      });
      await this.notifications.create(b.userId, {
        type: NotificationType.REVIEW,
        title: 'How was the movie?',
        message: `Share your thoughts about "${movie.title}".`,
        link: `/movies/${movie.slug}#reviews`,
      });
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async notifyWatchlistShowtimes() {
    const comingSoon = await this.prisma.movie.findMany({
      where: { status: 'NOW_SHOWING', isDeleted: false },
      select: { id: true, title: true, slug: true },
    });
    if (comingSoon.length === 0) return;

    const movieIds = comingSoon.map((m) => m.id);
    const items = await this.prisma.watchlistItem.findMany({
      where: { movieId: { in: movieIds }, notifyWhenAvailable: true },
      include: { movie: true },
    });

    for (const item of items) {
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: item.userId,
          type: NotificationType.WATCHLIST,
          message: { contains: item.movie.title },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (already) continue;

      await this.notifications.create(item.userId, {
        type: NotificationType.WATCHLIST,
        title: 'Now showing',
        message: `"${item.movie.title}" is now in cinemas. Book your tickets!`,
        link: `/movies/${item.movie.slug}`,
      });
    }
  }

  private groupInviteResponse(
    invite: { token: string; expiresAt: Date },
    booking: {
      showtimeId: string;
      showtime: { startTime: Date; movie: { title: string }; cinema: { name: string } };
      bookingItems: { rowLabel: string; seatNumber: number }[];
    },
  ) {
    return {
      token: invite.token,
      expiresAt: invite.expiresAt,
      sharePath: `/join/${invite.token}`,
      showtimeId: booking.showtimeId,
      movieTitle: booking.showtime.movie.title,
      cinemaName: booking.showtime.cinema.name,
      startTime: booking.showtime.startTime,
      seats: booking.bookingItems.map((s) => `${s.rowLabel}${s.seatNumber}`),
    };
  }

  private reviewRow(r: {
    id: string;
    userId: string;
    movieId: string;
    rating: number;
    content: string;
    isVerified: boolean;
    helpfulCount: number;
    createdAt: Date;
    user?: { id: string; fullName: string; avatar: string | null } | null;
    movie?: { id: string; title: string; slug: string; posterUrl: string } | null;
  }) {
    return {
      id: r.id,
      userId: r.userId,
      movieId: r.movieId,
      rating: r.rating,
      content: r.content,
      isVerified: r.isVerified,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt,
      userName: r.user?.fullName ?? 'User',
      userAvatar: r.user?.avatar ?? undefined,
      movie: r.movie,
    };
  }

  private postRow(p: {
    id: string;
    userId: string;
    movieId: string | null;
    content: string;
    hashtags: unknown;
    type: CommunityPostType;
    pollOptions: unknown;
    likeCount: number;
    createdAt: Date;
    user?: { id: string; fullName: string; avatar: string | null } | null;
    movie?: { id: string; title: string; slug: string } | null;
  }) {
    return {
      id: p.id,
      userId: p.userId,
      content: p.content,
      hashtags: p.hashtags,
      type: p.type,
      pollOptions: p.pollOptions,
      likeCount: p.likeCount,
      createdAt: p.createdAt,
      userName: p.user?.fullName ?? 'User',
      userAvatar: p.user?.avatar ?? undefined,
      movie: p.movie,
    };
  }

}
