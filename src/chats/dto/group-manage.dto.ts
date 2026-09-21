import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RenameGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}

export class AddGroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  memberIds!: string[];
}

export class SetGroupMemberRoleDto {
  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';
}
