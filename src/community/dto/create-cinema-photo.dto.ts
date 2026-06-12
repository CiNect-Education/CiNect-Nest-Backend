import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateCinemaPhotoDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true })
  imageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  movieId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}
