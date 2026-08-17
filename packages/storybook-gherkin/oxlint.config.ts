import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  options: {
    typeAware: true,
  },

  plugins: ['typescript', 'import', 'jsdoc', 'unicorn', 'oxc'],

  rules: {
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'error',
    'jsdoc/check-tag-names': ['warn', { definedTags: ['category', 'since', 'internal'] }],
    'typescript/switch-exhaustiveness-check': 'error',
    'typescript/ban-ts-comment': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-type-assertion': 'error',
  },

  overrides: [
    {
      // `Canvas` (declared in src/steps.observer.ts) is inferred from the upstream
      // `within()` helper, which the checker resolves to `any` for that generic
      // signature, so `PlayContext.canvas` is `any` and the one read of it here is
      // an unsafe assignment. Naming `Canvas` concretely means putting
      // `@testing-library/dom` in this published package's dependency surface,
      // because the emitted `.d.ts` would reference its types (TS2883). That is a
      // dependency decision, not a lint one - tracked separately. One site, so
      // scoped to one file rather than the whole package.
      files: ['src/feature.observer.ts'],
      rules: {
        'typescript/no-unsafe-assignment': 'off',
      },
    },
  ],
})
