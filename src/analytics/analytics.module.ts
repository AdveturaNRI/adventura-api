import { Global, Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AnalyticsAggregatorService } from './analytics-aggregator.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Global()
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsAggregatorService],
  exports: [AnalyticsService, AnalyticsAggregatorService],
})
export class AnalyticsModule {}
