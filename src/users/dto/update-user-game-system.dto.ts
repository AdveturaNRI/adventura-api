import { IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_GAME_SYSTEM_NAME_LENGTH } from '../../common/utils/game-system-name.utils';

export class UpdateUserGameSystemDto {
  @IsString()
  @MinLength(1, { message: 'Введите название системы' })
  @MaxLength(MAX_GAME_SYSTEM_NAME_LENGTH, { message: 'Слишком длинное название' })
  name!: string;
}
