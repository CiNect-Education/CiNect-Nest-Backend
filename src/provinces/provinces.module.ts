import { Module } from '@nestjs/common';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';
import { ProvinceResolverService } from './province-resolver.service';
import { ProvincesSyncService } from './provinces-sync.service';
import { ProvincesSyncScheduler } from './provinces-sync.scheduler';

@Module({
  controllers: [ProvincesController],
  providers: [
    ProvincesService,
    ProvinceResolverService,
    ProvincesSyncService,
    ProvincesSyncScheduler,
  ],
  exports: [ProvinceResolverService, ProvincesSyncService],
})
export class ProvincesModule {}
