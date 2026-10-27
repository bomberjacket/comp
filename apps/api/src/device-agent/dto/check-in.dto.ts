import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CheckDetailsDto {
  @IsString()
  @MaxLength(100)
  method: string;

  @IsString()
  @MaxLength(2000)
  raw: string;

  @IsString()
  @MaxLength(1000)
  message: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  exception?: string;
}

export class CheckResultDto {
  /**
   * The agent's check id. The four canonical ids (disk_encryption, antivirus,
   * password_policy, screen_lock) drive the compliance verdict; any other
   * well-formed id is stored as evidence in checkDetails, so the agent can
   * gain checks without an API release.
   */
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{2,39}$/)
  checkType: string;

  @IsBoolean()
  passed: boolean;

  @ValidateNested()
  @Type(() => CheckDetailsDto)
  @IsObject()
  @IsOptional()
  details?: CheckDetailsDto;

  @IsDateString()
  checkedAt: string;
}

export class CheckInDto {
  @IsString()
  @MinLength(1)
  deviceId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckResultDto)
  checks: CheckResultDto[];

  @IsString()
  @IsOptional()
  agentVersion?: string;

  /**
   * Current OS version as read by the agent at check-in time. Optional so
   * agents that predate this field keep working; when present it refreshes
   * the version recorded at registration.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  osVersion?: string;
}
