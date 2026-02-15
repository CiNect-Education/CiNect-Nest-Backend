import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponse<T = unknown> {
  @ApiProperty({ description: 'Response payload' })
  data: T;

  @ApiPropertyOptional({ description: 'Pagination or metadata' })
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Success or informational message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Error details for failed requests' })
  error?: string | Record<string, unknown>;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  timestamp: string;

  constructor(partial: Partial<ApiResponse<T>>) {
    Object.assign(this, partial);
  }
}
