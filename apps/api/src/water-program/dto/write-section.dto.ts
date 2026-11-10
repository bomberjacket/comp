import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SectionFieldDto {
  /** Label of a fill-in field of the section, exactly as the section definition has it. */
  @IsString()
  @MaxLength(200)
  label: string;

  @IsString()
  @MaxLength(8000)
  value: string;
}

export class WriteSectionDto {
  /** The utility's facts for the section, one entry per fill-in field; empty values clear a field. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SectionFieldDto)
  fields?: SectionFieldDto[];

  /** Free text beyond the fields; blank lines separate paragraphs. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string;

  /** Older clients: free text for the whole section, stored as the notes. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  text?: string;
}
