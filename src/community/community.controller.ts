import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CommunityTargetType } from '@prisma/client';
import { CommunityService } from './community.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CreateCinemaPhotoDto } from './dto/create-cinema-photo.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { reviewMulterOptions } from '../uploads/review-upload.config';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Public()
  @Get('stats')
  stats() {
    return this.communityService.getPublicStats();
  }

  @Public()
  @Get('reviews')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'verifiedOnly', required: false })
  @ApiQuery({ name: 'movieId', required: false })
  @ApiQuery({ name: 'cinemaId', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'helpful', 'rating'] })
  globalReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('movieId') movieId?: string,
    @Query('cinemaId') cinemaId?: string,
    @Query('sort') sort?: 'newest' | 'helpful' | 'rating',
  ) {
    const includeUnverified = verifiedOnly === 'false' || verifiedOnly === '0';
    const resolvedSort = sort === 'helpful' || sort === 'rating' ? sort : 'newest';
    return this.communityService.findGlobalReviews(page, limit, {
      verifiedOnly: !includeUnverified,
      movieId,
      cinemaId,
      sort: resolvedSort,
    });
  }

  @Public()
  @Get('posts')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'movieId', required: false })
  @ApiQuery({ name: 'hashtag', required: false })
  posts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('movieId') movieId?: string,
    @Query('hashtag') hashtag?: string,
  ) {
    return this.communityService.listPosts(page, limit, movieId, hashtag);
  }

  @Post('posts')
  @ApiBearerAuth()
  createPost(@CurrentUser('id') userId: string, @Body() dto: CreateCommunityPostDto) {
    return this.communityService.createPost(userId, dto);
  }

  @Post('posts/:id/vote')
  @ApiBearerAuth()
  votePoll(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: VotePollDto,
  ) {
    return this.communityService.votePoll(id, userId, dto);
  }

  @Public()
  @Get('photos')
  photos(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.communityService.listPhotos(page, limit);
  }

  @Post('photos')
  @ApiBearerAuth()
  createPhoto(@CurrentUser('id') userId: string, @Body() dto: CreateCinemaPhotoDto) {
    return this.communityService.createPhoto(userId, dto);
  }

  @Public()
  @Get('users/:id')
  publicProfile(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.communityService.getPublicProfile(id, viewerId);
  }

  @Get('watchlist')
  @ApiBearerAuth()
  watchlist(@CurrentUser('id') userId: string) {
    return this.communityService.getWatchlist(userId);
  }

  @Post('watchlist/:movieId')
  @ApiBearerAuth()
  addWatchlist(
    @CurrentUser('id') userId: string,
    @Param('movieId', ParseUuidPipe) movieId: string,
  ) {
    return this.communityService.addWatchlist(userId, movieId);
  }

  @Delete('watchlist/:movieId')
  @ApiBearerAuth()
  removeWatchlist(
    @CurrentUser('id') userId: string,
    @Param('movieId', ParseUuidPipe) movieId: string,
  ) {
    return this.communityService.removeWatchlist(userId, movieId);
  }

  @Public()
  @Get('join/:token')
  groupInvite(@Param('token') token: string) {
    return this.communityService.getGroupInviteByToken(token);
  }

  @Post('bookings/:bookingId/invite')
  @ApiBearerAuth()
  createGroupInvite(
    @Param('bookingId', ParseUuidPipe) bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.createGroupInvite(bookingId, userId);
  }

  @Post('reviews/:reviewId/react')
  @ApiBearerAuth()
  reactReview(
    @Param('reviewId', ParseUuidPipe) reviewId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.toggleReviewReaction(reviewId, userId);
  }

  @Get('review-prompts/pending')
  @ApiBearerAuth()
  pendingReviewPrompts(@CurrentUser('id') userId: string) {
    return this.communityService.getPendingReviewPrompts(userId);
  }

  @Post('review-prompts/:bookingId/dismiss')
  @ApiBearerAuth()
  dismissReviewPrompt(
    @Param('bookingId', ParseUuidPipe) bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.dismissReviewPrompt(userId, bookingId);
  }

  @Public()
  @Get('comments')
  listComments(
    @Query('targetType') targetType: string,
    @Query('targetId', ParseUuidPipe) targetId: string,
  ) {
    if (targetType !== CommunityTargetType.REVIEW && targetType !== CommunityTargetType.POST) {
      throw new BadRequestException('Invalid targetType');
    }
    return this.communityService.listComments(targetType, targetId);
  }

  @Post('comments')
  @ApiBearerAuth()
  createComment(@CurrentUser('id') userId: string, @Body() dto: CreateCommentDto) {
    return this.communityService.createComment(userId, dto);
  }

  @Post('reports')
  @ApiBearerAuth()
  createReport(@CurrentUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.communityService.createReport(userId, dto);
  }

  @Post('reviews/upload-image')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', reviewMulterOptions))
  uploadReviewImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image uploaded');
    return { url: this.communityService.reviewImagePublicUrl(file.filename!) };
  }
}
