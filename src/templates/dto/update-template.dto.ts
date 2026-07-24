import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  name?: string;

  /**
   * Shape is checked by `validateTokens` in the service rather than by
   * class-validator: the rules are per-key whitelists, and a rejected write
   * should say exactly which token was wrong.
   */
  @IsObject()
  @IsOptional()
  tokens?: Record<string, unknown>;
}
