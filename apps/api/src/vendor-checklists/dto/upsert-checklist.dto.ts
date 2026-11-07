import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChecklistItemInputDto {
  /** Item id from the checklist definition, e.g. `S-01` or `M-07`. */
  @IsString()
  @MaxLength(16)
  itemId: string;

  /** EPA weight: 0 not applicable, 1 low, 2 medium, 3 high. */
  @IsInt()
  @Min(0)
  @Max(3)
  weight: number;

  /** EPA score ranking: 0 no response / not met … 3 fully met. */
  @IsInt()
  @Min(0)
  @Max(3)
  score: number;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  supplierResponse?: string;

  /** Whether the supplier agreed to put the item in contract language. */
  @IsBoolean()
  @IsOptional()
  inContract?: boolean | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  explanation?: string;
}

export class UpsertChecklistDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInputDto)
  items: ChecklistItemInputDto[];

  @IsString()
  @MaxLength(200)
  @IsOptional()
  contractReference?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  evaluationFrequency?: string;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  notes?: string;
}
