import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePublicRequestDto {
  @IsUUID()
  offeringNodeId: string;

  @IsArray()
  @IsOptional()
  componentValues?: unknown[];

  @IsString()
  @MaxLength(100)
  @IsOptional()
  guestName?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
