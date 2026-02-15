import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class CreateHoldDto {
  @ApiProperty()
  @IsUUID()
  showtimeId: string;

  @ApiProperty({ type: [String], description: 'Seat IDs to hold' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  seatIds: string[];
}
