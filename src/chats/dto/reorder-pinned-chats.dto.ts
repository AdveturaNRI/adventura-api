import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderPinnedChatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  conversationIds!: string[];
}
