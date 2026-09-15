import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Длительность голосового сообщения указана неверно' })
  @Min(1, { message: 'Голосовое сообщение слишком короткое' })
  @Max(900, { message: 'Голосовое сообщение не может быть длиннее 15 минут' })
  voiceDurationSec?: number;

  @IsOptional()
  @IsString({ message: 'Волна голосового сообщения указана неверно' })
  @MaxLength(2000, { message: 'Волна голосового сообщения слишком большая' })
  voiceWaveform?: string;

  /** ID сообщения, на которое отвечаем (в этом же чате). */
  @IsOptional()
  @IsString()
  replyToId?: string;
}
