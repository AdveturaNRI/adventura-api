import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminKeyGuard } from './admin-key.guard';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [AuthModule],
  controllers: [RewardsController],
  providers: [RewardsService, AdminKeyGuard],
  exports: [RewardsService],
})
export class RewardsModule {}
