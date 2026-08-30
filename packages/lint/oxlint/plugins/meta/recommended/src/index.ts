import type { OxlintConfig, OxlintOverride } from 'oxlint'

const OBSERVER_FILES = ['**/*.test.ts', '**/tests/**', '**/__tests__/**'] as const

/**
 * Built-in namespaces the recommended rules key on. Spread into `plugins`;
 * a rule whose namespace is absent is reported as unknown, not applied.
 *
 * @public
 */
export const plugins = ['typescript', 'import', 'unicorn', 'vitest'] as const

/**
 * Type-aware rules produce no diagnostics at all when type awareness is off.
 * Spread into `options` or half this preset is inert without saying so.
 *
 * @public
 */
export const options = { typeAware: true } as const

/**
 * The test-file hygiene tier. Spread into `overrides`.
 *
 * The former cell-scoped tiers (pure/kernel/front-half/terminus suffix globs and
 * their importer groups) were removed per KTD5: the cell-role suffix taxonomy is
 * gone, the boundary rules are keyed to the `Workflow.make` callee by the custom
 * plugins, and a stock-rule glob cannot outlive the taxonomy that named it.
 *
 * @public
 */
export const overrides: OxlintOverride[] = [
  {
    files: [...OBSERVER_FILES],
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-standalone-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-identical-title': 'error',
    },
  },
]

/**
 * The universal defect tier: one rule per defect class, applied to every file.
 * Spread into `rules` for partial adoption; the default export carries the
 * whole preset.
 *
 * @public
 */
export const rules: NonNullable<OxlintConfig['rules']> = {
  'no-ternary': 'error',
  'typescript/no-explicit-any': 'error',
  'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'typescript/no-unsafe-argument': 'error',
  'typescript/no-unsafe-assignment': 'error',
  'typescript/no-unsafe-call': 'error',
  'typescript/no-unsafe-member-access': 'error',
  'typescript/no-unsafe-return': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
  'unicorn/no-abusive-eslint-disable': 'error',
  'typescript/no-floating-promises': 'error',
  'typescript/no-misused-promises': 'error',
  'typescript/await-thenable': 'error',
  'typescript/only-throw-error': 'error',
  'no-throw-literal': 'error',
  'typescript/no-unnecessary-condition': 'error',
  'typescript/strict-boolean-expressions': 'error',
  'typescript/no-unnecessary-type-assertion': 'error',
  'typescript/switch-exhaustiveness-check': [
    'error',
    { allowDefaultCaseForExhaustiveSwitch: false, considerDefaultExhaustiveForUnions: false },
  ],
  'typescript/no-base-to-string': 'error',
  'import/no-cycle': 'error',
  'import/no-mutable-exports': 'error',
  'no-var': 'error',
}

/**
 * The whole preset as one `extends`-consumable config: `extends: [recommended]`
 * delivers the plugins, type awareness, the correctness category, the universal
 * tier, and the test-file hygiene tier together.
 *
 * Typed as the host's own `OxlintConfig`, so a shape oxlint would ignore fails
 * this package's typecheck instead of silently under-enforcing in a consumer.
 *
 * @public
 */
const recommended: OxlintConfig = {
  plugins: [...plugins],
  options: { ...options },
  categories: { correctness: 'error' },
  rules: { ...rules },
  overrides: [...overrides],
}

export default recommended
