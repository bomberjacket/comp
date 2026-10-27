import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEnrollmentTokenDto {
  /** Label shown in the token list, e.g. "Ansible, shop servers". */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  /** Days until the token stops enrolling new devices. Default 30, at most a year. */
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  expiresInDays?: number;

  /** How many devices may enroll with the token. Default 100. */
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  maxUses?: number;
}
