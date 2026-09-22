import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { MarketingAttributionController } from './marketing-attribution.controller';
import { MarketingAttributionService } from './marketing-attribution.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MarketingAttributionController],
  providers: [MarketingAttributionService],
  exports: [MarketingAttributionService],
})
export class MarketingAttributionModule {}
