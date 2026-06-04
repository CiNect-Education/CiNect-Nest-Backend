import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsOptional,
  ValidateNested,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketProductCode } from '@prisma/client';

export class HoldTicketLineDto {
  @ApiProperty({ enum: TicketProductCode })
  @IsEnum(TicketProductCode)
  productCode: TicketProductCode;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateHoldDto {
  @ApiProperty()
  @IsUUID()
  showtimeId: string;

  @ApiProperty({ type: [String], description: 'Seat IDs to hold' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  seatIds: string[];

  @ApiPropertyOptional({ type: [HoldTicketLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldTicketLineDto)
  ticketLines?: HoldTicketLineDto[];
}
