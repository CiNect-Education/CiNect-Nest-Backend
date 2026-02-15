import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsOptional, IsString, IsInt, Min, IsUUID } from 'class-validator';

export class SnackItemDto {
  @ApiProperty()
  @IsUUID()
  snackId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateBookingDto {
  @ApiProperty()
  @IsUUID()
  showtimeId: string;

  @ApiProperty()
  @IsUUID()
  holdId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  promotionCode?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  pointsToUse?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  giftCardCode?: string;

  @ApiPropertyOptional({ type: [SnackItemDto] })
  @IsArray()
  @IsOptional()
  snacks?: SnackItemDto[];
}
