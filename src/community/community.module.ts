import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
