// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * ESLint (flat config) — backend NestJS.
 * Audit LOT 0 : ESLint était totalement absent. Config volontairement
 * pragmatique : on bloque les vrais problèmes (erreurs), on signale le reste
 * en `warn` pour ne pas casser la CI sur du style hérité (délégué à Prettier).
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
      '*.config.mjs',
      '*.config.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      // Vrais bugs → erreurs (héritées de recommended).
      // Confort / style hérité → warn (n'échoue pas la CI).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Code-smell (assignation écrasée) — signalé mais non bloquant en CI.
      'no-useless-assignment': 'warn',
      'prettier/prettier': 'warn',
    },
  },
);
