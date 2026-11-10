import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TabletopNoteDto {
  @IsString()
  @MaxLength(64)
  taskId: string;

  /** What the group said when the topic's questions were walked. */
  @IsString()
  @MaxLength(8000)
  discussion: string;

  /** Gaps or follow-up actions that came out of the topic. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  gaps?: string;
}

export class SaveTabletopDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  scenario?: string;

  @IsIn(['planned', 'held'])
  status: 'planned' | 'held';

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsDateString()
  heldOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  facilitator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  participants?: string;

  @IsInt()
  @Min(1)
  @Max(36)
  cadenceMonths: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TabletopNoteDto)
  notes: TabletopNoteDto[];

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  afterAction?: string;
}
