import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackEntityStatsDto {
  @IsIn(['club', 'player', 'game'])
  entity!: 'club' | 'player' | 'game';

  @IsString()
  @MaxLength(64)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS', 'SERVER'])
  platform?: 'WEB' | 'ANDROID' | 'IOS' | 'SERVER';
}
