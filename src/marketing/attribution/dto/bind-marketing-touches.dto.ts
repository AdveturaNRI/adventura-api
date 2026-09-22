import { IsUUID } from 'class-validator';

export class BindMarketingTouchesDto {
  @IsUUID('4', { message: 'Некорректный идентификатор посетителя' })
  anonymousId!: string;
}
