import { SetMetadata } from '@nestjs/common';

export const ANY_AUTHENTICATED_KEY = 'anyAuthenticated';

/**
 * Marque un endpoint comme accessible à tout utilisateur authentifié,
 * quel que soit son rôle. À utiliser explicitement lorsque l'on veut
 * éviter la règle fail-secure du `RolesGuard` (qui rejette tout endpoint
 * sans `@Roles()` ni `@Public()`).
 */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);
