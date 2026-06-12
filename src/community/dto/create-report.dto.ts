import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityTargetType, ContentReportReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ enum: CommunityTargetType })
  @IsEnum(CommunityTargetType)
  targetType: CommunityTargetType;

  @ApiProperty()
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: ContentReportReason })
  @IsEnum(ContentReportReason)
  reason: ContentReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
