import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityTargetType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ enum: CommunityTargetType })
  @IsEnum(CommunityTargetType)
  targetType: CommunityTargetType;

  @ApiProperty()
  @IsUUID()
  targetId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSpoiler?: boolean;
}
