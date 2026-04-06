import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatbotRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ default: 'vi' })
  @IsString()
  @IsOptional()
  locale?: string;
}

export class ChatbotResponseDto {
  @ApiProperty()
  reply: string;
}
