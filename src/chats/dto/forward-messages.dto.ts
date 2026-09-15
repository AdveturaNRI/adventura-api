import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ForwardMessagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  messageIds!: string[];
}
