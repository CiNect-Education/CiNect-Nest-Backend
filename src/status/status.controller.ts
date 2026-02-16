import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('status')
@Controller()
export class StatusController {
  @Public()
  @Get('status')
  getStatus() {
    return {
      status: 'online',
      maintenance: false,
      version: '1.0.0',
    };
  }
}
