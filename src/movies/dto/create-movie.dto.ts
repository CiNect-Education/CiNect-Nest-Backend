import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Max,
} from 'class-validator';
import { MovieStatus, AgeRating } from '@prisma/client';

export class CreateMovieDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  originalTitle?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsUrl()
  posterUrl: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  trailerUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  galleryUrls?: string[];

  @ApiProperty()
  @IsNumber()
  @Min(1)
  duration: number;

  @ApiProperty()
  @IsDateString()
  releaseDate: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  director: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  castMembers?: string[];

  @ApiPropertyOptional({ default: 'Vietnamese' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  subtitles?: string;

  @ApiPropertyOptional({ enum: AgeRating })
  @IsEnum(AgeRating)
  @IsOptional()
  ageRating?: AgeRating;

  @ApiPropertyOptional({ type: [String], default: ['2D'] })
  @IsArray()
  @IsOptional()
  formats?: string[];

  @ApiPropertyOptional({ enum: MovieStatus })
  @IsEnum(MovieStatus)
  @IsOptional()
  status?: MovieStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  genreIds?: string[];
}
