import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GiftsService } from './gifts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';

@ApiTags('gift-cards')
@Controller('gift-cards')
export class GiftsController {
  constructor(private readonly giftsService: GiftsService) {}

  @Public()
  @Get()
  findAll() {
    return this.giftsService.findAll();
  }

  @ApiBearerAuth()
  @Post('purchase')
  purchaseByBody(
    @Body() body: { giftCardId: string; recipientEmail?: string; message?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.giftsService.purchase(
      body.giftCardId,
      userId,
      body.recipientEmail,
      body.message,
    );
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.giftsService.findOne(id);
  }

  @ApiBearerAuth()
  @Post(':id/purchase')
  purchase(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
    @Query('recipientEmail') recipientEmail?: string,
    @Query('message') message?: string,
  ) {
    return this.giftsService.purchase(id, userId, recipientEmail, message);
  }
}
