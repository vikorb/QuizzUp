import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

// Règles typescript-eslint communes au frontend et au TypeScript du backend.
const TS_SHARED_RULES = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  '@typescript-eslint/no-shadow': 'error',
}

const BACKEND_TS_FILES = ['**/backend/**/*.ts', '**/tests/backend/**/*.ts']

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-console/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.output/**',
      '**/build/**',
    ],
  },

  js.configs.recommended,

  {
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
      'id-length': [
        'error',
        {
          min: 2,
          exceptions: ['t'],
          properties: 'never',
        },
      ],

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

  {
    files: ['**/backend/**/*.{js,cjs,mjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-process-exit': 'off',
    },
  },

  // Scripts Node du frontend (contrôles de construction), pas du code du navigateur.
  {
    files: ['**/frontend/scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-console': 'off', 'no-process-exit': 'off' },
  },

  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/frontend/**/*.{ts,tsx}'],
    rules: {
      ...(config.rules ?? {}),
      ...TS_SHARED_RULES,
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: ['../*', '../../*', '../../../*', '../../../../*', '../../../../../*'],
        },
      ],

      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        {
          selector: 'objectLiteralProperty',
          modifiers: ['requiresQuotes'],
          format: null,
        },
        { selector: 'objectLiteralProperty', format: ['camelCase'] },
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
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
      ],
    },
  })),

  // TypeScript du backend et de ses tests : jeu de règles volontairement réduit (défauts réels,
  // coût de correction faible). Les règles globales ci-dessus (tri des imports, imports et
  // variables inutilisés, eqeqeq, no-useless-assignment) s'y appliquent aussi.
  // Hors périmètre pour l'instant, avec le nombre de constats mesuré sur backend/ et tests/backend :
  // - @typescript-eslint/naming-convention : 3138 (colonnes de base en snake_case)
  // - no-restricted-imports : 664
  // - consistent-return : 477
  // - id-length : 124
  // - unicorn/consistent-function-scoping : 94
  // - no-param-reassign : 12 (mutation voulue de req, route, accumulateurs et lignes de test)
  ...[tseslint.configs.base, tseslint.configs.eslintRecommended].map((config) => ({
    ...config,
    files: BACKEND_TS_FILES,
  })),
  {
    files: BACKEND_TS_FILES,
    rules: {
      ...TS_SHARED_RULES,
      'no-shadow': 'off',
      'consistent-return': 'off',
      'id-length': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'no-param-reassign': 'off',
    },
  },

  {
    files: ['**/frontend/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser },
    },
  },

  ...vue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['**/frontend/**/*.vue'],
    rules: {
      ...(config.rules ?? {}),
      'vue/no-v-html': 'error',
      'vue/no-mutating-props': 'error',
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
    },
  })),

  eslintConfigPrettier,
]
