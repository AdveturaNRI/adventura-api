import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @IsString()
  @MinLength(3, { message: 'Никнейм должен быть не короче 3 символов' })
  @MaxLength(24, { message: 'Никнейм должен быть не длиннее 24 символов' })
  @Matches(/^[^\s@]+$/, {
    message: 'Никнейм не должен содержать пробелы или @',
  })
  nickname!: string;

  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не короче 8 символов' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  acquisitionSource?: string;

  /** Browser-generated UUID used only to claim that browser's anonymous touches. */
  @IsOptional()
  @IsUUID('4', { message: 'Некорректный идентификатор посетителя' })
  anonymousId?: string;
}
