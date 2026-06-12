import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { ProvincesModule } from '../provinces/provinces.module';
import { CommunityModule } from '../community/community.module';

@Module({
  imports: [ProvincesModule, CommunityModule],
  controllers: [MoviesController],
  providers: [MoviesService],
  exports: [MoviesService],
})
export class MoviesModule {}
