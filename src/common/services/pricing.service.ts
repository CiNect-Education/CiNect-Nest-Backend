import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomFormat, SeatType, DayType, TimeSlot } from '@prisma/client';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSeatPrice(params: {
    showtimeId: string;
    seatId: string;
    cinemaId: string;
    format: RoomFormat;
    seatType: SeatType;
    startTime: Date;
  }): Promise<number> {
    const dayType = this.getDayType(params.startTime);
    const timeSlot = this.getTimeSlot(params.startTime);

    const rules = await this.prisma.pricingRule.findMany({
      where: { isActive: true },
    });

    let bestMatch: { rule: { price: { toNumber: () => number } }; score: number } | null = null;

    for (const rule of rules) {
      const score = this.matchScore({
        rule,
        cinemaId: params.cinemaId,
        seatType: params.seatType,
        format: params.format,
        dayType,
        timeSlot,
      });
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { rule, score };
      }
    }

    if (bestMatch) {
      return Number(bestMatch.rule.price);
    }

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: params.showtimeId },
    });
    return showtime ? Number(showtime.basePrice) : 0;
  }

  private matchScore(params: {
    rule: {
      cinemaId: string | null;
      seatType: SeatType | null;
      format: RoomFormat | null;
      dayType: DayType | null;
      timeSlot: TimeSlot | null;
    };
    cinemaId: string;
    seatType: SeatType;
    format: RoomFormat;
    dayType: DayType;
    timeSlot: TimeSlot;
  }): number {
    let score = 0;
    if (params.rule.cinemaId && params.rule.cinemaId === params.cinemaId) score += 10;
    if (params.rule.seatType && params.rule.seatType === params.seatType) score += 8;
    if (params.rule.format && params.rule.format === params.format) score += 6;
    if (params.rule.dayType && params.rule.dayType === params.dayType) score += 4;
    if (params.rule.timeSlot && params.rule.timeSlot === params.timeSlot) score += 2;
    return score;
  }

  private getDayType(date: Date): DayType {
    const day = date.getDay();
    if (day === 0 || day === 6) return 'WEEKEND';
    // Could add holiday check
    return 'WEEKDAY';
  }

  private getTimeSlot(date: Date): TimeSlot {
    const h = date.getHours();
    if (h >= 5 && h < 12) return 'MORNING';
    if (h >= 12 && h < 17) return 'AFTERNOON';
    if (h >= 17 && h < 21) return 'EVENING';
    return 'NIGHT';
  }
}
