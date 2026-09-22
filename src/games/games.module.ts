import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { MarketingConversionsModule } from '../marketing/conversions/marketing-conversions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [
    AuthModule,
    MediaModule,
    ImageModule,
    ChatsModule,
    MarketingConversionsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
