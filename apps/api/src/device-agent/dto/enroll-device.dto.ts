import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/** Body of POST /v1/device-agent/enroll: an enrollment token plus the device facts. */
export class EnrollDeviceDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  hostname: string;

  @IsEnum(['macos', 'windows', 'linux'])
  platform: 'macos' | 'windows' | 'linux';

  @IsString()
  @MinLength(1)
  osVersion: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  hardwareModel?: string;

  @IsString()
  @IsOptional()
  agentVersion?: string;
}
