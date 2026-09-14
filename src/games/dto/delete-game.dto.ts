import { IsBoolean, IsOptional } from 'class-validator';

export class DeleteGameDto {
  @IsOptional()
  @IsBoolean()
  deleteChat?: boolean;
}
