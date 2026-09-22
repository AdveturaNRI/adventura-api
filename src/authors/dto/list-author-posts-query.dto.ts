import { IsIn, IsOptional, IsString } from 'class-validator';

import { CREATIVITY_CATEGORIES } from '../types/author.type';

export class ListAuthorPostsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['all', ...CREATIVITY_CATEGORIES], { message: 'Неизвестный фильтр категории' })
  category?: 'all' | (typeof CREATIVITY_CATEGORIES)[number];
}
