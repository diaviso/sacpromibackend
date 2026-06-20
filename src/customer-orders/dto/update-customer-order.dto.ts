import { PartialType } from '@nestjs/swagger';
import { CreateCustomerOrderDto } from './create-customer-order.dto';

/**
 * Modification d'une commande client — tous les champs optionnels.
 * Le service refuse la modification dès qu'une livraison a commencé
 * (CONFIRMED + invoices déjà émises, PARTIALLY_DELIVERED, DELIVERED,
 * CLOSED, CANCELLED).
 */
export class UpdateCustomerOrderDto extends PartialType(CreateCustomerOrderDto) {}
