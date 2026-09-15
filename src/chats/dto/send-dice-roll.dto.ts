import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
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
}
