import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}
