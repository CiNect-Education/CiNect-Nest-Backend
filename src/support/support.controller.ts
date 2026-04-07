import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { ContactDto } from './dto/contact.dto';
import { ChatbotRequestDto } from './dto/chatbot.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Public()
  @Post('contact')
  contact(
    @Body() dto: ContactDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.supportService.contact(dto, userId);
  }

  @Public()
  @Post('ticket')
  submitTicket(
    @Body() dto: ContactDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.supportService.contact(dto, userId);
  }

  @Public()
  @Post('chatbot')
  chatbot(@Body() dto: ChatbotRequestDto) {
    return this.supportService.chatbot(dto);
  }
}
