import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProvincesSyncService } from './provinces-sync.service';

@Injectable()
export class ProvincesSyncScheduler {
  private readonly logger = new Logger(ProvincesSyncScheduler.name);

  constructor(private readonly syncService: ProvincesSyncService) {}

  /** Weekly sync — enable with PROVINCES_SYNC_CRON=true */
  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklySync() {
    if (process.env.PROVINCES_SYNC_CRON !== 'true') return;
    try {
      await this.syncService.syncWithLog();
    } catch (err) {
      this.logger.error('Weekly province sync failed', err);
    }
  }
}
