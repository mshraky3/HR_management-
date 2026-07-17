import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import unusedImports from 'eslint-plugin-unused-imports'
import react from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // AuthContext reads process.env behind a typeof guard for non-Vite
        // environments — declare it so no-undef doesn't flag the guarded use.
        process: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      react,
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Intentional empty catch blocks (best-effort localStorage access etc.)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Advisory: flags prop→state sync effects. Real perf hint but requires
      // restructuring to fix — keep visible as warnings, not blocking errors.
      'react-hooks/set-state-in-effect': 'warn',
      // Context files export provider + hook together (standard pattern);
      // only affects dev HMR granularity, never production.
      'react-refresh/only-export-components': 'warn',
      // CRITICAL: without jsx-uses-vars, ESLint scope analysis does NOT count
      // <Component /> element usage, so unused-import detection would flag and
      // strip imports that are only used in JSX. Keep these three together.
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      // Auto-fixable removal of unused import statements (npx eslint --fix)
      'unused-imports/no-unused-imports': 'error',
    },
  },
])
