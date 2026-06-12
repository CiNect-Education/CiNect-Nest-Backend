import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RefundMethod } from '@prisma/client';
import { RefundReasonCode } from './refund-reason.enum';

export class RequestRefundDto {
  @ApiProperty({ enum: RefundReasonCode })
  @IsEnum(RefundReasonCode)
  reasonCode: RefundReasonCode;

  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((o: RequestRefundDto) => o.reasonCode === RefundReasonCode.OTHER)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reasonDetail?: string;

  @ApiPropertyOptional({ enum: RefundMethod, default: RefundMethod.STORE_CREDIT })
  @IsOptional()
  @IsEnum(RefundMethod)
  method?: RefundMethod;
}
