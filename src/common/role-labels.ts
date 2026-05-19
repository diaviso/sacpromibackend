import { UserRole } from '@prisma/client';

export const ROLE_LABELS: Record<UserRole, string> = {
  DIRECTOR: 'Directeur',
  PRODUCTION_MANAGER: 'Responsable Production',
  BREEDING_MANAGER: 'Responsable Élevage',
  SALES_MANAGER: 'Responsable Commercial',
  OPERATOR: 'Opérateur',
};
