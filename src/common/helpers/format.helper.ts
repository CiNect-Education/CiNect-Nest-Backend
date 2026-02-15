import { RoomFormat } from '@prisma/client';

/**
 * Maps Prisma RoomFormat enum names to frontend-friendly labels.
 * Prisma returns the TypeScript enum name (e.g. STANDARD2D),
 * but the frontend expects "2D", "3D", "IMAX", "4DX", "DOLBY".
 */
const FORMAT_MAP: Record<string, string> = {
  [RoomFormat.STANDARD2D]: '2D',
  [RoomFormat.STANDARD3D]: '3D',
  [RoomFormat.IMAX]: 'IMAX',
  [RoomFormat.FOURDX]: '4DX',
  [RoomFormat.DOLBY]: 'DOLBY',
};

export function mapRoomFormat(format: RoomFormat | string): string {
  return FORMAT_MAP[format] ?? format;
}
