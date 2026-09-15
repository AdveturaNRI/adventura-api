import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { ArtOrientation } from '../kandinsky-prompt';

export class GenerateArtDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt!: string;

  @IsIn(['portrait', 'landscape', 'square'])
  orientation!: ArtOrientation;

  /** Совместимость со старым клиентом — игнорируется */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;
}
