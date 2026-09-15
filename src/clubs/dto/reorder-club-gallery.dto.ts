import { ArrayMaxSize, IsArray, IsInt, Max, Min } from 'class-validator';

/** Порядок текущих позиций галереи, например [2, 0, 1]. */
export class ReorderClubGalleryDto {
  @IsArray({ message: 'Порядок галереи должен быть списком' })
  @ArrayMaxSize(8, { message: 'В галерее может быть не больше 8 фото' })
  @IsInt({ each: true, message: 'Позиция фото указана неверно' })
  @Min(0, { each: true, message: 'Позиция фото указана неверно' })
  @Max(7, { each: true, message: 'Позиция фото указана неверно' })
  order!: number[];
}
