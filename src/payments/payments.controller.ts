import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Post('initiate')
  initiate(@Body() dto: InitiatePaymentDto, @CurrentUser('id') userId: string) {
    return this.paymentsService.initiate(dto.bookingId, userId, dto.method);
  }

  @Public()
  @Get('callback')
  callbackGet(@Query('transactionId') transactionId: string) {
    return this.paymentsService.getByTransactionId(transactionId);
  }

  @Public()
  @Post('callback')
  callback(
    @Query('transactionId') transactionId?: string,
    @Query('success') successParam?: string,
    @Body() body?: { transactionId?: string; success?: boolean | string | number },
  ) {
    const tx = transactionId ?? body?.transactionId ?? '';
    const successFromQuery = successParam === 'true' || successParam === '1';
    const successFromBody =
      body?.success === true || body?.success === 'true' || body?.success === 1 || body?.success === '1';
    return this.paymentsService.callback(tx, successFromBody || successFromQuery);
  }

  @ApiBearerAuth()
  @Get(':id/status')
  getStatus(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.getStatus(id, userId);
  }
}
