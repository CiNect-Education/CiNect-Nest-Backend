import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CreateCinemaPhotoDto } from './dto/create-cinema-photo.dto';
import { VotePollDto } from './dto/vote-poll.dto';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Public()
  @Get('reviews')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'verifiedOnly', required: false })
  globalReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('verifiedOnly') verifiedOnly?: string,
  ) {
    const includeUnverified = verifiedOnly === 'false' || verifiedOnly === '0';
    return this.communityService.findGlobalReviews(page, limit, !includeUnverified);
  }

  @Public()
  @Get('posts')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'movieId', required: false })
  posts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('movieId') movieId?: string,
  ) {
    return this.communityService.listPosts(page, limit, movieId);
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

  @Get('referral')
  @ApiBearerAuth()
  referral(@CurrentUser('id') userId: string) {
    return this.communityService.getReferralInfo(userId);
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
}
