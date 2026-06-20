import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExpenseDto } from './create-expense.dto';

/**
 * Mise à jour d'une dépense — tous les champs deviennent optionnels.
 * On exclut `isRecurring` et `recurrenceDayOfMonth` car la nature
 * récurrente d'une dépense ne devrait pas être modifiée après création.
 *
 * Le service refuse toute modification d'une dépense CONFIRMED (elle a
 * déjà généré une écriture de trésorerie).
 */
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['isRecurring', 'recurrenceDayOfMonth'] as const),
) {}
