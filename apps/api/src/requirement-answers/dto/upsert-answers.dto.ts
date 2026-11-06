import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const ANSWER_DOMAINS = ['all', 'it', 'ot'] as const;
export const ANSWER_VALUES = [
  'yes',
  'incomplete',
  'scoped',
  'no',
  'not_applicable',
  'alternate',
] as const;

export class AnswerInputDto {
  /** FrameworkEditorRequirement id mapped into this framework instance. */
  @IsString()
  requirementId: string;

  @IsIn(ANSWER_DOMAINS)
  @IsOptional()
  domain?: (typeof ANSWER_DOMAINS)[number];

  @IsIn(ANSWER_VALUES)
  answer: (typeof ANSWER_VALUES)[number];

  /** Required for not_applicable and alternate. */
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  justification?: string;

  @IsString()
  @MaxLength(8000)
  @IsOptional()
  comment?: string;

  @IsBoolean()
  @IsOptional()
  markForReview?: boolean;
}

export class UpsertAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  answers: AnswerInputDto[];
}

export class AnswerSettingDto {
  /** Domains this organization answers for an IT/OT framework; empty means both. */
  @IsArray()
  @IsIn(['it', 'ot'], { each: true })
  domains: ('it' | 'ot')[];
}

export class ImportCsetDto {
  /** A CSET assessment JSON export (`AssessmentExportPayload`). */
  @IsObject()
  payload: Record<string, unknown>;
}
