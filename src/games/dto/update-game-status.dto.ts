import { IsEnum } from 'class-validator';

export enum UpdateGameStatusDtoEnum {
  RECRUITING = 'RECRUITING',
  CLOSED = 'CLOSED',
  FINISHED = 'FINISHED',
}

export class UpdateGameStatusDto {
  @IsEnum(UpdateGameStatusDtoEnum)
  status!: UpdateGameStatusDtoEnum;
}
