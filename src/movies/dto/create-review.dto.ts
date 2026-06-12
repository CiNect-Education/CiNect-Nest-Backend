import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REVIEW_EMOTION_TAGS } from '../../community/community.constants';

export class CreateReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  rating: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSpoiler?: boolean;
}

export function sanitizeReviewTags(tags?: string[]): string[] {
  if (!tags?.length) return [];
  const allowed = new Set<string>(REVIEW_EMOTION_TAGS);
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => allowed.has(t)))];
}
