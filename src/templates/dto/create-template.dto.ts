import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  name?: string;

  /** Clone a built-in preset instead of supplying tokens. */
  @IsString()
  @IsOptional()
  presetId?: string;

  /** Validated by `validateTokens` in the service, same as on update. */
  @IsObject()
  @IsOptional()
  tokens?: Record<string, unknown>;
}
