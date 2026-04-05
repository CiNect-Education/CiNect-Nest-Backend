import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ProvincesService } from './provinces.service';

@ApiTags('provinces')
@Controller('provinces')
@Public()
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get('new')
  findNew() {
    return this.provincesService.findNew();
  }

  @Get('legacy')
  findLegacy() {
    return this.provincesService.findLegacy();
  }
}
