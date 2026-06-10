import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProvinceSyncResult,
  syncProvincesFromOpenApi,
} from './province-sync.logic';

@Injectable()
export class ProvincesSyncService {
  private readonly logger = new Logger(ProvincesSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  sync(): Promise<ProvinceSyncResult> {
    return syncProvincesFromOpenApi(this.prisma);
  }

  async syncWithLog(): Promise<ProvinceSyncResult> {
    this.logger.log('Starting province sync from provinces.open-api.vn…');
    const result = await this.sync();
    this.logger.log(
      `Province sync done: ${result.newUpserted} new, ${result.legacyUpserted} legacy (${result.legacySkipped} skipped)`,
    );
    return result;
  }
}
