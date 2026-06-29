# SACPROMI — Backend (API NestJS)

API de gestion intégrée SACPROMI : production d'aliments pour animaux, élevage de
poulets de chair, ventes, finance & trésorerie.

## Stack

- **NestJS 11** (Node 22+) · **Prisma 6** · **PostgreSQL 16**
- Auth JWT (access + refresh) avec blacklist de tokens · RBAC 5 rôles
- Validation `class-validator` · Helmet · CORS · Throttler · Swagger
- Tests : Jest · Lint : ESLint (flat config) + Prettier

## Démarrage rapide

```bash
npm install
npm run db:setup     # crée la base + applique migrations + seed (données démo)
npm run start:dev    # API sur http://localhost:3070/api
```

Voir [../SETUP.md](../SETUP.md) (installation détaillée) et [../DEPLOY.md](../DEPLOY.md) (déploiement).

## Scripts utiles

| Script | Rôle |
|---|---|
| `npm run start:dev` | API en watch (port 3070) |
| `npm run build` | Compilation (`nest build`) |
| `npm run typecheck` | `tsc --noEmit` (aucune émission) |
| `npm run lint` | ESLint (non bloquant sur warnings) |
| `npm run lint:fix` | ESLint + corrections automatiques |
| `npm run format` | Prettier `--write` |
| `npm test` | Tests unitaires Jest |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run seed` | Données de démo |
| `npm run generate-secrets` | Génère des secrets JWT robustes |

## Configuration (.env)

Copier [.env.example](.env.example) en `.env`. Les variables sont **validées au
démarrage** ([src/config/env.validation.ts](src/config/env.validation.ts)) :
l'API **refuse de démarrer** si `DATABASE_URL` ou les secrets JWT sont manquants,
ou si un secret par défaut/placeholder est utilisé en production.

## Documentation API

Swagger : **http://localhost:3070/api/docs** (désactivable en prod via
`SWAGGER_ENABLED=false`).

## Qualité

La CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) exécute
typecheck + lint + tests + build sur chaque PR.
