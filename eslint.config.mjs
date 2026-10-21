// ESLint 10 (flat config): `npm run lint` · διόρθωση όσων γίνεται αυτόματα: `npm run lint:fix`.
//
// Τι ελέγχεται: JS (eslint:recommended), TypeScript (typescript-eslint), React hooks + React Compiler
// (eslint-plugin-react-hooks 7). ΔΕΝ μπαίνουν (Οκτ. 2026):
//  • @next/eslint-plugin-next / eslint-config-next — φέρνει το braces (high, χωρίς διορθωμένη έκδοση)·
//  • eslint-plugin-react / jsx-a11y — δεν υποστηρίζουν ακόμη ESLint 10.
// Επανεξέταση όταν βγουν συμβατές/καθαρές εκδόσεις (κανόνας «τελευταία έκδοση» στο CLAUDE.md).
//
// Σφάλματα (error) = πραγματικά bugs· προειδοποιήσεις (warn) = θέματα ποιότητας που διορθώνονται σταδιακά.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.next/**', 'node_modules/**', 'public/**', 'out/**', 'build/**', 'dist/**',
    'prisma/migrations/**', 'next-env.d.ts', 'mobile-app/**', 'softone/**', '**/*.min.js',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      // TypeScript: ο compiler ήδη ελέγχει τα ονόματα — το no-undef δίνει ψευδή σφάλματα σε τύπους.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      // Αρχική τιμή πριν από try/catch που ξαναγράφεται — σκόπιμο μοτίβο, όχι bug.
      'no-useless-assignment': 'warn',

      // React: οι κανόνες των hooks είναι bugs (error)· οι προτάσεις του React Compiler (warn).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },

  // Scripts σε CommonJS (require/module.exports).
  {
    files: ['**/*.cjs', 'scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
