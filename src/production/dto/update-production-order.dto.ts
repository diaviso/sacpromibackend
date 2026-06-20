import { PartialType } from '@nestjs/swagger';
import { CreateProductionOrderDto } from './create-production-order.dto';

/**
 * Mise à jour d'un ordre de production PLANNED uniquement.
 * Le service refuse dès que l'ordre est IN_PROGRESS (matières
 * consommées) ou COMPLETED (lot créé).
 */
export class UpdateProductionOrderDto extends PartialType(CreateProductionOrderDto) {}
