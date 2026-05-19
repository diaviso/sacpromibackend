import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFormulaDto } from './create-formula.dto';

/** Mise à jour : on ne change pas le produit lié (sinon nouvelle formule). */
export class UpdateFormulaDto extends PartialType(
  OmitType(CreateFormulaDto, ['finishedProductId'] as const),
) {}
