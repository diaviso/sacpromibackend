import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Politique de mot de passe (audit LOT 3) : ≥ 12 caractères + complexité
 * minimale (une minuscule, une majuscule, un chiffre).
 *
 * S'applique uniquement à la DÉFINITION d'un nouveau mot de passe
 * (register / reset / change / création par le directeur). La connexion n'est
 * pas impactée, donc les comptes existants restent utilisables.
 */
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(12, {
      message: 'Le mot de passe doit contenir au moins 12 caractères',
    }),
    MaxLength(100),
    Matches(/[a-z]/, {
      message: 'Le mot de passe doit contenir au moins une minuscule',
    }),
    Matches(/[A-Z]/, {
      message: 'Le mot de passe doit contenir au moins une majuscule',
    }),
    Matches(/[0-9]/, {
      message: 'Le mot de passe doit contenir au moins un chiffre',
    }),
  );
}
