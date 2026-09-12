import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class DeleteConversationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  forEveryone?: boolean;
}
