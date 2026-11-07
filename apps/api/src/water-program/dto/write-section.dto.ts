import { IsString, MaxLength } from 'class-validator';

export class WriteSectionDto {
  /** The utility's text for the section; blank lines separate paragraphs; empty clears it. */
  @IsString()
  @MaxLength(20000)
  text: string;
}
