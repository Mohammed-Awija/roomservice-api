import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ServiceComponentType, ComponentSetBy, Prisma } from '@prisma/client';

export class CreateComponentDto {
  @IsUUID()
  offeringNodeId: string;

  @IsEnum(ServiceComponentType)
  type: ServiceComponentType;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  // Prisma's JSON input type rather than Record<string, unknown>: the latter's
  // `unknown` values aren't assignable to InputJsonValue.
  @IsObject()
  @IsOptional()
  config?: Prisma.InputJsonObject;

  @IsEnum(ComponentSetBy)
  @IsOptional()
  setBy?: ComponentSetBy;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}
