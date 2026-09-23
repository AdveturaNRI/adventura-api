import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMusicPlaylistDto {
  @IsString({ message: 'Название должно быть текстом' })
  @MinLength(1, { message: 'Укажите название плейлиста' })
  @MaxLength(120, { message: 'Название слишком длинное' })
  title!: string;
}

export class UpdateMusicPlaylistDto {
  @IsOptional()
  @IsString({ message: 'Название должно быть текстом' })
  @MinLength(1, { message: 'Укажите название плейлиста' })
  @MaxLength(120, { message: 'Название слишком длинное' })
  title?: string;
}

export class UpdateMusicTrackDto {
  @IsString({ message: 'Название должно быть текстом' })
  @MinLength(1, { message: 'Укажите название трека' })
  @MaxLength(200, { message: 'Название слишком длинное' })
  title!: string;
}

export class AddPlaylistTrackDto {
  @IsString({ message: 'Укажите трек' })
  @MinLength(1, { message: 'Укажите трек' })
  trackId!: string;
}

export class ReorderPlaylistTracksDto {
  @IsArray({ message: 'Список треков должен быть массивом' })
  @ArrayMaxSize(200, { message: 'Слишком много треков' })
  @IsString({ each: true, message: 'Некорректный идентификатор трека' })
  trackIds!: string[];
}

export class RefreshMusicTrackUrlsDto {
  @IsArray({ message: 'Список треков должен быть массивом' })
  @ArrayMaxSize(200, { message: 'Слишком много треков' })
  @IsString({ each: true, message: 'Некорректный идентификатор трека' })
  trackIds!: string[];
}

export class CreateMusicTrackFromUrlDto {
  @IsString({ message: 'Укажите ссылку' })
  @MinLength(8, { message: 'Укажите ссылку' })
  @MaxLength(2000, { message: 'Ссылка слишком длинная' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, {
    message: 'Нужна ссылка вида https://… на аудиофайл',
  })
  url!: string;

  @IsOptional()
  @IsString({ message: 'Название должно быть текстом' })
  @MinLength(1, { message: 'Укажите название трека' })
  @MaxLength(200, { message: 'Название слишком длинное' })
  title?: string;
}
