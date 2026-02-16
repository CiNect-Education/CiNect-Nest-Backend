import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('campaigns')
@Controller('campaigns')
@Public()
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get('active')
  findActive() {
    return this.campaignsService.findActive();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.campaignsService.findBySlug(slug);
  }
}
