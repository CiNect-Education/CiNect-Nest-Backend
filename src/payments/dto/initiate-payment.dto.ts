import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty()
  @IsUUID()
  bookingId: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
