import { correctness as tsgoCorrectness, recommended as tsgoRecommended } from '@effect/tsgo/oxlint-presets'
import cellArchitectureConfig, { jsPlugins as cellJsPlugins } from '@systemfsoftware/oxlint-config-cell-architecture'
import dmmfConfig, { ignorePatterns, jsPlugins as dmmfJsPlugins } from '@systemfsoftware/oxlint-config-dmmf'
import effectPlatform from '@systemfsoftware/oxlint-plugin-effect-platform'
import testDiscipline from '@systemfsoftware/oxlint-plugin-test-discipline'
import type { OxlintConfig } from 'oxlint'

export const promoteWarnToError = (rules: Record<string, unknown> | undefined): Record<string, 'error' | 'off'> => {
  const out: Record<string, 'error' | 'off'> = {}
  if (!rules) return out
  for (const [key, severity] of Object.entries(rules)) {
    if (severity === 'warn' || severity === 'error') out[key] = 'error'
    else if (severity === 'off') out[key] = 'off'
    else if (Array.isArray(severity) && (severity[0] === 'warn' || severity[0] === 'error')) out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'off') out[key] = 'off'
  }
  return out
}

const effectPlatformJsPlugin = import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-platform')

export const jsPlugins: readonly string[] = [
  ...dmmfJsPlugins,
  ...cellJsPlugins,
  import.meta.resolve('@systemfsoftware/oxlint-plugin-test-discipline'),
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'unicorn',
  'vitest',
  'jsdoc',
  'node',
  'oxc',
  'promise',
]

export const options: NonNullable<OxlintConfig['options']> = {
  typeAware: true,
}

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...testDiscipline.configs.recommended.rules,
}

const testFilePatterns = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/tests/**',
] as const

const entryFilePatterns = [...testFilePatterns, '**/test-types/**', '**/examples/**'] as const

// The promoted tsgo preset carries node-builtin-import; the entry roles omit it, so the promoted
// entry is dropped here rather than re-declared.
const { 'effecttsgo/node-builtin-import': _platformChoiceIsAnEntryDecision, ...entryPromoted } = {
  ...promoteWarnToError(tsgoCorrectness.rules),
  ...promoteWarnToError(tsgoRecommended.rules),
}

// Entry set: every Effect rule the entry roles carry. Two rules are absent here rather than set to
// off, because both name a composition decision the entry point is allowed to make: providing a
// Layer, and choosing the runtime's platform — whose own API needs the Node factory.
const entryRules: NonNullable<OxlintConfig['rules']> = {
  ...entryPromoted,
  'effecttsgo/global-date-in-effect': 'error',
  'effecttsgo/global-timers-in-effect': 'error',
  'effecttsgo/new-promise': 'error',
  'effecttsgo/strict-boolean-expressions': 'error',
  'effecttsgo/missing-pipeable-signature': 'error',
  'effecttsgo/missed-pipeable-opportunity': 'error',
  'effecttsgo/process-env': 'error',
  'effecttsgo/any-unknown-in-error-context': 'error',
  'effecttsgo/global-date': 'error',
  'effecttsgo/global-timers': 'error',
}

// Library set: the entry set plus the two rules that pin those decisions to the entry point —
// shipped library code provides no Layer and reaches no Node builtin on its own.
const libraryRules: NonNullable<OxlintConfig['rules']> = {
  ...entryRules,
  'effecttsgo/node-builtin-import': 'error',
  'effecttsgo/strict-effect-provide': 'error',
}

const observerOverrides: NonNullable<OxlintConfig['overrides']> = [
  {
    files: [...testFilePatterns],
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-identical-title': 'error',
    },
  },
]

const recommendedConfig: OxlintConfig = {
  extends: [dmmfConfig, cellArchitectureConfig],
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  categories: { correctness: 'error' },
  ignorePatterns: [...ignorePatterns],
  overrides: [...observerOverrides],
}

export default recommendedConfig

const effectPlugins: NonNullable<OxlintConfig['plugins']> = ['effecttsgo']
const effectJsPlugins: NonNullable<OxlintConfig['jsPlugins']> = [effectPlatformJsPlugin]
const effectRules: NonNullable<OxlintConfig['rules']> = {
  ...effectPlatform.configs.recommended.rules,
}

const sourceOverride = (rules: OxlintConfig['rules']): NonNullable<OxlintConfig['overrides']> => [
  {
    files: ['**/src/**'],
    rules: { ...rules },
  },
]

const entryOverride = (rules: OxlintConfig['rules']): NonNullable<OxlintConfig['overrides']> => [
  {
    files: [...entryFilePatterns],
    rules: { ...rules },
  },
]

// Library role: shipped src/ carries the full library set; entry files carry the entry set.
export const effect: OxlintConfig = {
  extends: [recommendedConfig],
  plugins: effectPlugins,
  jsPlugins: effectJsPlugins,
  rules: effectRules,
  overrides: [
    ...sourceOverride(libraryRules),
    ...entryOverride(entryRules),
    ...effectPlatform.configs.recommended.overrides,
  ],
}

// Composition role: every file is a composition point, so both overrides carry the entry set.
export const effectComposition: OxlintConfig = {
  extends: [recommendedConfig],
  plugins: effectPlugins,
  jsPlugins: effectJsPlugins,
  rules: effectRules,
  overrides: [
    ...sourceOverride(entryRules),
    ...entryOverride(entryRules),
    ...effectPlatform.configs.recommended.overrides,
  ],
}
