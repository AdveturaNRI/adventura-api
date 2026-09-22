import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RewardsModule } from '../rewards/rewards.module';
import { StorageModule } from '../storage/storage.module';
import { ArtQueueService } from './art-queue.service';
import { ArtStudioController } from './art-studio.controller';
import { ArtStudioService } from './art-studio.service';
import { FusionBrainClient } from './fusionbrain.client';

@Module({
  imports: [AuthModule, StorageModule, RewardsModule],
  controllers: [ArtStudioController],
  providers: [ArtStudioService, ArtQueueService, FusionBrainClient],
})
export class ArtStudioModule {}
