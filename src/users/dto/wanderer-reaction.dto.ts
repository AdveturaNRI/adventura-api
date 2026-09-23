import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum WandererReactionDtoType {
  FAVORITE = 'favorite',
  SKIPPED = 'skipped',
}

export class UpsertWandererReactionDto {
  @IsIn(['favorite', 'skipped'], {
    message: 'Тип реакции должен быть favorite или skipped',
  })
  type!: 'favorite' | 'skipped';
}

export const WANDERER_BUCKETS = ['feed', 'favorites', 'skipped'] as const;
export type WandererBucket = (typeof WANDERER_BUCKETS)[number];

export class ListWanderersQueryDto {
  @IsOptional()
  @IsIn(WANDERER_BUCKETS, {
    message: 'bucket должен быть feed, favorites или skipped',
  })
  bucket?: WandererBucket = 'feed';
}

export class SearchWanderersQueryDto {
  @IsString()
  @MinLength(1, { message: 'Введите хотя бы один символ ника' })
  @MaxLength(40)
  q!: string;
}
