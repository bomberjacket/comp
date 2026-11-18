import { IsObject, IsOptional } from 'class-validator';

/** The whole Who's who list; the service keeps only the defined roles, contacts and facts. */
export class SaveRosterDto {
  @IsOptional()
  @IsObject()
  staff?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  facts?: Record<string, unknown>;
}
