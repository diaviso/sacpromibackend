import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFinishedProductDto } from './create-finished-product.dto';

export class UpdateFinishedProductDto extends PartialType(
  OmitType(CreateFinishedProductDto, ['code'] as const),
) {}
