import * as Joi from 'joi';

/**
 * Schéma de validation des variables d'environnement (fail-fast au démarrage).
 *
 * Objectif sécurité (LOT 0 / LOT 3 de l'audit) :
 *  - rendre OBLIGATOIRES les secrets critiques (DATABASE_URL, JWT_*),
 *  - REFUSER de démarrer en production avec les valeurs par défaut/placeholder,
 *  - imposer une longueur minimale aux secrets JWT en production.
 *
 * Sans ce schéma, l'application démarrait avec des secrets manquants puis
 * échouait silencieusement plus tard (ou pire : acceptait des JWT signés avec
 * un secret par défaut public).
 */

// Valeurs placeholder présentes dans .env.example — interdites en production.
const PLACEHOLDER_ACCESS = 'change-this-access-secret-in-production';
const PLACEHOLDER_REFRESH = 'change-this-refresh-secret-in-production';

const jwtSecret = (placeholder: string) =>
  Joi.string()
    .required()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .min(32)
        .invalid(placeholder)
        .messages({
          'string.min':
            'Le secret JWT doit faire au moins 32 caractères en production.',
          'any.invalid':
            'Le secret JWT par défaut (placeholder) est interdit en production. Générez-en un avec `npm run generate-secrets`.',
        }),
      otherwise: Joi.string().min(8),
    });

export const envValidationSchema = Joi.object({
  // --- Application ---
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3070),
  TZ: Joi.string().default('Africa/Dakar'),

  // --- Base de données ---
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),

  // --- Authentification JWT ---
  JWT_ACCESS_SECRET: jwtSecret(PLACEHOLDER_ACCESS),
  JWT_ACCESS_EXPIRATION: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: jwtSecret(PLACEHOLDER_REFRESH),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  // --- Sécurité ---
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).default(12),

  // --- CORS / URLs ---
  CORS_ORIGIN: Joi.string().default('http://localhost:3071'),
  APP_URL: Joi.string().uri().default('http://localhost:3071'),

  // --- Mailer (optionnel : si MAIL_HOST absent → jsonTransport) ---
  MAIL_HOST: Joi.string().allow('').optional(),
  MAIL_PORT: Joi.number().port().optional(),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').optional(),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASS: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().allow('').optional(),

  // --- Sauvegarde / uploads ---
  BACKUP_DIR: Joi.string().optional(),
  BACKUP_RETENTION_DAYS: Joi.number().integer().min(1).optional(),
  UPLOAD_DIR: Joi.string().default('./uploads'),

  // --- Swagger ---
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').optional(),

  // --- Observabilité (optionnel) ---
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .optional(),
  SENTRY_DSN: Joi.string().allow('').optional(),
})
  // On autorise les variables non listées (ex. variables plateforme Railway).
  .unknown(true);
