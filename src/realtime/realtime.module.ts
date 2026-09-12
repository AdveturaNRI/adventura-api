import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeEmitter, RealtimeGateway],
  exports: [RealtimeEmitter],
})
export class RealtimeModule {}
