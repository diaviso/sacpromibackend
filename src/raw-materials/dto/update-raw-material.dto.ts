import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRawMaterialDto } from './create-raw-material.dto';

export class UpdateRawMaterialDto extends PartialType(
  OmitType(CreateRawMaterialDto, ['code', 'averagePrice'] as const),
) {}
