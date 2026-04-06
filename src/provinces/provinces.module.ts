import { Module } from '@nestjs/common';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';
import { ProvinceResolverService } from './province-resolver.service';

@Module({
  controllers: [ProvincesController],
  providers: [ProvincesService, ProvinceResolverService],
  exports: [ProvinceResolverService],
})
export class ProvincesModule {}
