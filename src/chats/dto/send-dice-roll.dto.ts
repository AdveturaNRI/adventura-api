import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const ALLOWED_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export class DiceRollDieDto {
  @IsInt()
  @IsIn([...ALLOWED_SIDES])
  sides!: number;

  @IsInt()
  @Min(1)
  @Max(8)
  qty!: number;
}

/** Раскладка с клиента (3D-бросок на фронте). */
export class DiceRollClientGroupDto {
  @IsInt()
  @IsIn([...ALLOWED_SIDES])
  sides!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  values!: number[];
}

export class SendDiceRollDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DiceRollDieDto)
  dice!: DiceRollDieDto[];

  @IsOptional()
  @IsInt()
  @Min(-99)
  @Max(99)
  modifier?: number;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  /** Hex `#RRGGBB` — цвет кубов у отправителя, для анимации у зрителей. */
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  /** Эксклюзивный скин кубиков (alpha_pioneer и т.п.). */
  @IsOptional()
  @IsIn(['standard', 'alpha_pioneer', 'neon_glitch', 'founding_obsidian'])
  skin?: string;

  /** Итог броска с фронта — источник истины. Без поля сервер бросает сам (legacy). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DiceRollClientGroupDto)
  groups?: DiceRollClientGroupDto[];

  /** Преимущество / помеха — только вместе с 2d20. */
  @IsOptional()
  @IsIn(['normal', 'advantage', 'disadvantage'])
  mode?: 'normal' | 'advantage' | 'disadvantage';
}
