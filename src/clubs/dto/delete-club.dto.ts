import { IsString, MaxLength, MinLength } from 'class-validator';

/** The UI must ask the owner to type the club name before a soft delete. */
export class DeleteClubDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  confirmationName!: string;
}
