import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { BannersService } from './banners.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('banners')
@Controller('banners')
@Public()
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @ApiQuery({ name: 'position', required: false })
  findAll(@Query('position') position?: string) {
    return this.bannersService.findAll(position);
  }
}
