import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Сообщение слишком длинное' })
  message?: string | null;
}
