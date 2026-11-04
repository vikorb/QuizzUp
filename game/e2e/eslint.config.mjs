import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Mêmes règles que `game/hardware/eslint.config.mjs` (elles-mêmes reprises du backoffice).
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },

  js.configs.recommended,

  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      unicorn,
    },
    rules: {
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-coercion': 'error',
      'no-useless-catch': 'error',
      'no-throw-literal': 'error',
      'no-shadow': 'error',
      'no-param-reassign': ['error', { props: true }],
      'consistent-return': 'error',
      'id-length': ['error', { min: 2, exceptions: ['t'], properties: 'never' }],

      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'unused-imports/no-unused-imports': 'error',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
    rules: {
      ...(config.rules ?? {}),
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'objectLiteralProperty', modifiers: ['requiresQuotes'], format: null },
        { selector: 'objectLiteralProperty', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeProperty', format: ['camelCase'] },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        {
          selector: 'variable',
          filter: { regex: '^[A-Z]', match: true },
          format: ['PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'variable',
          filter: { regex: '^[a-z_]', match: true },
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
      ],
    },
  })),

  {
    // Les tests et le banc écrivent des données externes telles quelles : codes de touches
    // (`KeyboardEvent.code` : KeyA, Escape…) et noms d'événements du moteur (buzzer_pressed…).
    files: ['tests/**/*.ts', 'harness/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'function', format: ['camelCase'] },
      ],
      'unicorn/consistent-function-scoping': 'off',
    },
  },

  eslintConfigPrettier,
]
