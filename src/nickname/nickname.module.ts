import { Module } from '@nestjs/common';

import { NicknameService } from './nickname.service';

@Module({
  providers: [NicknameService],
  exports: [NicknameService],
})
export class NicknameModule {}
