import effectEntrypointPlugin from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import effectNativePlugin from '@systemfsoftware/oxlint-plugin-effect-native'
import effectNativePreset from '@systemfsoftware/oxlint-plugin-effect-native/preset'
import effectSchemaPlugin from '@systemfsoftware/oxlint-plugin-effect-schema'
import effectSchemaPreset from '@systemfsoftware/oxlint-plugin-effect-schema/preset'
import effectWorkflowPlugin from '@systemfsoftware/oxlint-plugin-effect-workflow'
import effectWorkflowPreset from '@systemfsoftware/oxlint-plugin-effect-workflow/preset'
import propertyTestingPlugin from '@systemfsoftware/oxlint-plugin-property-testing'
import propertyTestingPreset from '@systemfsoftware/oxlint-plugin-property-testing/preset'
import structurePlugin from '@systemfsoftware/oxlint-plugin-structure'
import structurePreset from '@systemfsoftware/oxlint-plugin-structure/preset'
import tagDisciplinePlugin from '@systemfsoftware/oxlint-plugin-tag-discipline'
import tagDisciplinePreset from '@systemfsoftware/oxlint-plugin-tag-discipline/preset'
import testHygienePlugin from '@systemfsoftware/oxlint-plugin-test-hygiene'
import testHygienePreset from '@systemfsoftware/oxlint-plugin-test-hygiene/preset'
import testPlacementPlugin from '@systemfsoftware/oxlint-plugin-test-placement'
import testPlacementPreset from '@systemfsoftware/oxlint-plugin-test-placement/preset'

import type { OxlintConfig } from 'oxlint'
import { describe, expect, it } from 'vitest'

import base from '../oxlint-config.base.js'

/**
 * The pre-change map's re-key table: every custom rule key the pre-change base
 * resolved — its own aggregate literals plus the `effect-dmmf` recommended
 * spread — paired with the leaf fragment that now owns it. Pinned as a literal
 * because the pre-change composition (an aggregate plugin re-keying three
 * private leaves, plus a `effect-dmmf` union of five more) no longer exists to
 * import. Ownership was read from each leaf's `src/index.ts`; the census at
 * `docs/census/oxlint/CENSUS.md` names five owners wrongly, and
 * `docs/census/oxlint/base-parity-diff.md` records the corrections.
 */
const ID_MAPPING: Readonly<Record<string, string>> = {
  // effect-native — 8
  '@systemfsoftware/oxlint-plugin/no-date-now-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-date-now-in-effect',
  '@systemfsoftware/oxlint-plugin/no-logging-in-catch':
    '@systemfsoftware/oxlint-plugin-effect-native/no-logging-in-catch',
  '@systemfsoftware/oxlint-plugin/no-native-map-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-native-map-in-effect',
  '@systemfsoftware/oxlint-plugin/no-native-set-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-native-set-in-effect',
  '@systemfsoftware/oxlint-plugin/no-native-setinterval-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-native-setinterval-in-effect',
  '@systemfsoftware/oxlint-plugin/no-native-settimeout-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-native-settimeout-in-effect',
  '@systemfsoftware/oxlint-plugin/no-new-promise-in-effect':
    '@systemfsoftware/oxlint-plugin-effect-native/no-new-promise-in-effect',
  '@systemfsoftware/oxlint-plugin/no-new-worker-with-wasm-import':
    '@systemfsoftware/oxlint-plugin-effect-native/no-new-worker-with-wasm-import',
  // tag-discipline — 3
  '@systemfsoftware/oxlint-plugin/no-context-generic-tag':
    '@systemfsoftware/oxlint-plugin-tag-discipline/no-context-generic-tag',
  '@systemfsoftware/oxlint-plugin/no-direct-tag-access':
    '@systemfsoftware/oxlint-plugin-tag-discipline/no-direct-tag-access',
  '@systemfsoftware/oxlint-plugin/no-either-tag-assertions':
    '@systemfsoftware/oxlint-plugin-tag-discipline/no-either-tag-assertions',
  // structure — 6
  '@systemfsoftware/oxlint-plugin/ban-error-string': '@systemfsoftware/oxlint-plugin-structure/ban-error-string',
  '@systemfsoftware/oxlint-plugin/internal-export-jsdoc':
    '@systemfsoftware/oxlint-plugin-structure/internal-export-jsdoc',
  '@systemfsoftware/oxlint-plugin/no-barrels': '@systemfsoftware/oxlint-plugin-structure/no-barrels',
  '@systemfsoftware/oxlint-plugin/no-inline-destructured-type':
    '@systemfsoftware/oxlint-plugin-structure/no-inline-destructured-type',
  '@systemfsoftware/oxlint-plugin/no-internal-jsdoc-outside':
    '@systemfsoftware/oxlint-plugin-structure/no-internal-jsdoc-outside',
  '@systemfsoftware/oxlint-plugin/no-io-boundary-tests':
    '@systemfsoftware/oxlint-plugin-structure/no-io-boundary-tests',
  // effect-schema — 9
  '@systemfsoftware/oxlint-plugin-effect-dmmf/ban-data-taggederror':
    '@systemfsoftware/oxlint-plugin-effect-schema/ban-data-taggederror',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/ban-effect-schema-imports':
    '@systemfsoftware/oxlint-plugin-effect-schema/ban-effect-schema-imports',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-member':
    '@systemfsoftware/oxlint-plugin-effect-schema/no-manual-tag-member',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-property':
    '@systemfsoftware/oxlint-plugin-effect-schema/no-manual-tag-property',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-checked-element-named':
    '@systemfsoftware/oxlint-plugin-effect-schema/schema-checked-element-named',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-declaration-location':
    '@systemfsoftware/oxlint-plugin-effect-schema/schema-declaration-location',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-file-exports-schemas-only':
    '@systemfsoftware/oxlint-plugin-effect-schema/schema-file-exports-schemas-only',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-filter-constructive-generation':
    '@systemfsoftware/oxlint-plugin-effect-schema/schema-filter-constructive-generation',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-recursive-union-budget':
    '@systemfsoftware/oxlint-plugin-effect-schema/schema-recursive-union-budget',
  // effect-workflow — 7
  '@systemfsoftware/oxlint-plugin-effect-dmmf/damp-workflow-stem':
    '@systemfsoftware/oxlint-plugin-effect-workflow/damp-workflow-stem',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-body-purity':
    '@systemfsoftware/oxlint-plugin-effect-workflow/make-body-purity',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-command-schema':
    '@systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-file-location':
    '@systemfsoftware/oxlint-plugin-effect-workflow/make-file-location',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-export-topology':
    '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-file-export-topology',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-make-presence':
    '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-file-make-presence',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-match-exhaustive':
    '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-match-exhaustive',
  // property-testing — 9
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-assert-in-property':
    '@systemfsoftware/oxlint-plugin-property-testing/no-assert-in-property',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-nested-quantification':
    '@systemfsoftware/oxlint-plugin-property-testing/no-nested-quantification',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-silent-return':
    '@systemfsoftware/oxlint-plugin-property-testing/no-silent-return',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-unbounded-fanout':
    '@systemfsoftware/oxlint-plugin-property-testing/no-unbounded-fanout',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-arbitrary-schema-origin':
    '@systemfsoftware/oxlint-plugin-property-testing/prop-arbitrary-schema-origin',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-fixture-schema-origin':
    '@systemfsoftware/oxlint-plugin-property-testing/prop-fixture-schema-origin',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-generated-law-duplicate':
    '@systemfsoftware/oxlint-plugin-property-testing/prop-generated-law-duplicate',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/property-file-purity':
    '@systemfsoftware/oxlint-plugin-property-testing/property-file-purity',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/require-effect-fastcheck':
    '@systemfsoftware/oxlint-plugin-property-testing/require-effect-fastcheck',
  // test-hygiene — 4
  '@systemfsoftware/oxlint-plugin-effect-dmmf/damp-test-naming':
    '@systemfsoftware/oxlint-plugin-test-hygiene/damp-test-naming',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-behaviourless-assertion':
    '@systemfsoftware/oxlint-plugin-test-hygiene/no-behaviourless-assertion',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-unrun-effect-test':
    '@systemfsoftware/oxlint-plugin-test-hygiene/no-unrun-effect-test',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/pbt-naming': '@systemfsoftware/oxlint-plugin-test-hygiene/pbt-naming',
  // test-placement — 12
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-exercises-use-case':
    '@systemfsoftware/oxlint-plugin-test-placement/behaviour-exercises-use-case',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-one-feature-per-file':
    '@systemfsoftware/oxlint-plugin-test-placement/behaviour-one-feature-per-file',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-test-requires-gherkin':
    '@systemfsoftware/oxlint-plugin-test-placement/behaviour-test-requires-gherkin',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-prop-only':
    '@systemfsoftware/oxlint-plugin-test-placement/in-source-test-prop-only',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-targets-private':
    '@systemfsoftware/oxlint-plugin-test-placement/in-source-test-targets-private',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-io-module-in-source-test':
    '@systemfsoftware/oxlint-plugin-test-placement/no-io-module-in-source-test',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-test-file-in-src':
    '@systemfsoftware/oxlint-plugin-test-placement/no-test-file-in-src',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/src-property-test-cell':
    '@systemfsoftware/oxlint-plugin-test-placement/src-property-test-cell',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/test-file-outside-tests-dir':
    '@systemfsoftware/oxlint-plugin-test-placement/test-file-outside-tests-dir',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/test-suffix-outside-src':
    '@systemfsoftware/oxlint-plugin-test-placement/test-suffix-outside-src',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-dir-helpers-in-fixtures':
    '@systemfsoftware/oxlint-plugin-test-placement/tests-dir-helpers-in-fixtures',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api':
    '@systemfsoftware/oxlint-plugin-test-placement/tests-import-public-api',
}

/** Every custom rule key, with its resolved severity, that the pre-change base configured. */
const PRE_CHANGE_RULES: Readonly<Record<string, 'error' | 'off'>> = {
  '@systemfsoftware/oxlint-plugin/ban-error-string': 'error',
  '@systemfsoftware/oxlint-plugin/no-context-generic-tag': 'error',
  '@systemfsoftware/oxlint-plugin/no-date-now-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/no-direct-tag-access': 'error',
  '@systemfsoftware/oxlint-plugin/no-either-tag-assertions': 'error',
  '@systemfsoftware/oxlint-plugin/no-io-boundary-tests': 'error',
  '@systemfsoftware/oxlint-plugin/no-logging-in-catch': 'error',
  '@systemfsoftware/oxlint-plugin/no-new-promise-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/no-native-map-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/no-native-set-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/no-native-setinterval-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/no-native-settimeout-in-effect': 'error',
  '@systemfsoftware/oxlint-plugin/internal-export-jsdoc': 'error',
  '@systemfsoftware/oxlint-plugin/no-internal-jsdoc-outside': 'error',
  '@systemfsoftware/oxlint-plugin/no-new-worker-with-wasm-import': 'error',
  '@systemfsoftware/oxlint-plugin/no-barrels': 'off',
  '@systemfsoftware/oxlint-plugin/no-inline-destructured-type': 'off',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-silent-return': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-assert-in-property': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/property-file-purity': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/require-effect-fastcheck': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-unbounded-fanout': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-nested-quantification': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-generated-law-duplicate': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-arbitrary-schema-origin': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/prop-fixture-schema-origin': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/damp-workflow-stem': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-file-location': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-match-exhaustive': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-body-purity': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/make-command-schema': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-export-topology': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-make-presence': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/damp-test-naming': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-behaviourless-assertion': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-unrun-effect-test': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/pbt-naming': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-prop-only': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/in-source-test-targets-private': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-test-file-in-src': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/src-property-test-cell': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/test-file-outside-tests-dir': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/test-suffix-outside-src': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-test-requires-gherkin': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-exercises-use-case': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/behaviour-one-feature-per-file': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-dir-helpers-in-fixtures': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-io-module-in-source-test': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/ban-effect-schema-imports': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/ban-data-taggederror': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-member': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/no-manual-tag-property': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-checked-element-named': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-declaration-location': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-filter-constructive-generation': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-file-exports-schemas-only': 'error',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-recursive-union-budget': 'error',
}

/** The pre-change base, rebuilt from the pinned map so the harness can be exercised on it. */
const PRE_CHANGE_BASE: OxlintConfig = {
  jsPlugins: ['@systemfsoftware/oxlint-plugin', '@systemfsoftware/oxlint-plugin-effect-dmmf'],
  rules: { ...PRE_CHANGE_RULES },
}

/**
 * The four rules the aggregates never loaded — effect-entrypoint's — because no
 * aggregate registered their plugin. They are the delivery-asymmetry fix, and
 * the only ids post may add. cell-vocabulary's one rule is deliberately not
 * here: it depends on `@systemfsoftware/effect-cell-types`, which closes a
 * package cycle through this config (OX-DL1), so it is delivered consumer-side.
 */
const ASYMMETRY_IDS: readonly string[] = [
  '@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-interprets-once',
  '@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-no-exports',
  '@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-no-promise-wrapper',
  '@systemfsoftware/oxlint-plugin-effect-entrypoint/entrypoint-not-imported',
]

/** The stock deltas base keeps as its own, verbatim. */
const STOCK_RULES: Readonly<Record<string, unknown>> = {
  'no-console': 'off',
  'no-debugger': 'off',
  'typescript/no-unnecessary-boolean-literal-compare': 'off',
  'typescript/explicit-module-boundary-types': 'off',
  'typescript/no-explicit-any': 'error',
  'jest/no-standalone-expect': 'off',
  'jest/valid-expect': 'off',
  'vitest/no-standalone-expect': 'off',
  'typescript/switch-exhaustiveness-check': 'error',
  'typescript/ban-ts-comment': 'error',
  'typescript/no-floating-promises': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/no-unnecessary-type-assertion': 'error',
  'typescript/no-unsafe-argument': 'error',
  'typescript/no-unsafe-assignment': 'error',
  'typescript/no-unsafe-call': 'error',
  'typescript/no-unsafe-member-access': 'error',
  'typescript/no-unsafe-return': 'error',
  'typescript/no-unsafe-type-assertion': 'error',
}

/** The three custom literals base still owns: the worker rule and the two opt-outs. */
const OWN_CUSTOM_RULES: Readonly<Record<string, string>> = {
  '@systemfsoftware/oxlint-plugin-effect-native/no-new-worker-with-wasm-import': 'error',
  '@systemfsoftware/oxlint-plugin-structure/no-barrels': 'off',
  '@systemfsoftware/oxlint-plugin-structure/no-inline-destructured-type': 'off',
}

/** The test-file override block, re-keyed to the leaf namespaces that own the rules. */
const TEST_FILE_OVERRIDE_RULES: Readonly<Record<string, unknown>> = {
  '@systemfsoftware/oxlint-plugin-effect-native/no-native-map-in-effect': 'off',
  '@systemfsoftware/oxlint-plugin-effect-native/no-native-set-in-effect': 'off',
  '@systemfsoftware/oxlint-plugin-effect-native/no-native-setinterval-in-effect': 'off',
  '@systemfsoftware/oxlint-plugin-effect-native/no-native-settimeout-in-effect': 'off',
  '@systemfsoftware/oxlint-plugin-effect-native/no-new-promise-in-effect': 'off',
  '@systemfsoftware/oxlint-plugin-tag-discipline/no-direct-tag-access': 'off',
  'vitest/expect-expect': 'off',
  'typescript/no-unsafe-type-assertion': 'off',
}

/** The fixture override block, which names stock rules only. */
const FIXTURE_OVERRIDE_RULES: Readonly<Record<string, unknown>> = {
  'typescript/no-unsafe-argument': 'off',
  'typescript/no-unsafe-assignment': 'off',
  'typescript/no-unsafe-call': 'off',
  'typescript/no-unsafe-member-access': 'off',
  'typescript/no-unsafe-return': 'off',
  'typescript/no-unsafe-type-assertion': 'off',
}

const IGNORE_PATTERNS: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/lib/**',
  '**/esm/**',
  '**/cjs/**',
  '**/build/**',
  '**/out/**',
  '**/.tshy/**',
  '**/.tshy-build/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.stryker-tmp/**',
  '**/__pycache__/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
  '**/.claude/**',
  '**/.opencode/**',
  '**/.sisyphus/**',
  '**/.repo/**',
  '**/.worktrees/**',
  '**/.issues/**',
  '**/.papi/**',
  '**/submodules/**',
  '**/repos/**',
]

const LEAF_FRAGMENTS = [
  { name: 'effect-native', preset: effectNativePreset, plugin: effectNativePlugin },
  { name: 'tag-discipline', preset: tagDisciplinePreset, plugin: tagDisciplinePlugin },
  { name: 'structure', preset: structurePreset, plugin: structurePlugin },
  { name: 'effect-schema', preset: effectSchemaPreset, plugin: effectSchemaPlugin },
  { name: 'effect-workflow', preset: effectWorkflowPreset, plugin: effectWorkflowPlugin },
  { name: 'property-testing', preset: propertyTestingPreset, plugin: propertyTestingPlugin },
  { name: 'test-hygiene', preset: testHygienePreset, plugin: testHygienePlugin },
  { name: 'test-placement', preset: testPlacementPreset, plugin: testPlacementPlugin },
  { name: 'effect-entrypoint', preset: effectEntrypointPreset, plugin: effectEntrypointPlugin },
] as const

const CUSTOM_PREFIX = '@systemfsoftware/'

type Rules = Record<string, unknown>
type ReKeyPair = readonly [oldId: string, newId: string]
type SeverityPair = readonly [oldId: string, preSeverity: unknown, resolvedSeverity: unknown]

const namespaceOf = (leaf: string): string => `@systemfsoftware/oxlint-plugin-${leaf}/`

/**
 * The rules oxlint resolves for a config: extended configs merge in order with
 * the last entry winning, then the config's own rules win over all of them.
 * Modelled here because `defineConfig` returns the declaration, not the merge.
 */
const resolveRules = (config: OxlintConfig): Rules => {
  const resolved: Rules = {}
  for (const parent of config.extends ?? []) Object.assign(resolved, resolveRules(parent))
  Object.assign(resolved, config.rules ?? {})
  return resolved
}

const RESOLVED_BASE_RULES: Rules = resolveRules(base)
const BASE_RULES: Rules = base.rules
const BASE_EXTENDS: readonly OxlintConfig[] = base.extends

const customIds = (rules: Rules): readonly string[] => Object.keys(rules).filter((id) => id.startsWith(CUSTOM_PREFIX))

/** Every custom rule key base resolves, from the extended fragments and from its override blocks. */
const baseCustomIds = (): readonly string[] => {
  const ids = [...customIds(RESOLVED_BASE_RULES)]
  for (const override of base.overrides) ids.push(...customIds(override.rules))
  return ids
}

const orphanedCustomIds = (ids: readonly string[]): readonly string[] =>
  ids.filter((id) => !LEAF_FRAGMENTS.some((leaf) => id.startsWith(namespaceOf(leaf.name))))

/** The rule names each fragment's plugin declares, keyed by the namespace its rule ids use. */
const declaredRules = (): Record<string, readonly string[] | undefined> => {
  const declared: Record<string, readonly string[] | undefined> = {}
  for (const leaf of LEAF_FRAGMENTS) declared[namespaceOf(leaf.name)] = Object.keys(leaf.plugin.rules)
  return declared
}

/** Ids whose namespace is not a loaded plugin, or whose rule that plugin does not declare. */
const unknownCustomIds = (ids: readonly string[]): readonly string[] => {
  const declared = declaredRules()
  const split = (id: string): readonly [string, string] => [
    id.slice(0, id.lastIndexOf('/') + 1),
    id.slice(id.lastIndexOf('/') + 1),
  ]
  return ids.filter((id) => {
    const [namespace, rule] = split(id)
    const rules = declared[namespace]
    if (rules === undefined) return true
    return !rules.includes(rule)
  })
}

type Parity = {
  mapped: readonly ReKeyPair[]
  mismatched: readonly SeverityPair[]
  dropped: readonly string[]
  added: readonly string[]
  unrekeyed: readonly string[]
}

/** Severity/options equality: config values are JSON-shaped (a string, or a string plus an options object). */
const sameSeverity = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

/** Compares a resolved rule map against the pinned pre-change map through the re-key table. */
const parityOf = (
  resolved: Rules,
  pre: Readonly<Record<string, unknown>>,
  table: Readonly<Record<string, string>>,
): Parity => {
  const mapped: ReKeyPair[] = []
  const mismatched: SeverityPair[] = []
  const dropped: string[] = []
  const targets: Record<string, true | undefined> = {}
  for (const newId of Object.values(table)) targets[newId] = true
  for (const [oldId, newId] of Object.entries(table)) {
    if (!Object.hasOwn(resolved, newId)) {
      dropped.push(newId)
      continue
    }
    mapped.push([oldId, newId])
    if (!sameSeverity(resolved[newId], pre[oldId])) mismatched.push([oldId, pre[oldId], resolved[newId]])
  }
  const added = customIds(resolved)
    .filter((id) => targets[id] === undefined && !Object.hasOwn(pre, id))
    .sort()
  const unrekeyed = Object.keys(resolved).filter((id) => Object.hasOwn(pre, id) && table[id] !== id).sort()
  return { mapped, mismatched, dropped, added, unrekeyed }
}

/** The stock deltas base declares that no longer resolve to the severity it declares for them. */
const stockRuleDrift = (): readonly string[] =>
  Object.entries(STOCK_RULES)
    .filter(([id, severity]) => !sameSeverity(RESOLVED_BASE_RULES[id], severity))
    .map(([id]) => id)

/** The custom literals base declares that no longer resolve to the severity it declares for them. */
const ownCustomRuleDrift = (): readonly string[] =>
  Object.entries(OWN_CUSTOM_RULES)
    .filter(([id, severity]) => !sameSeverity(BASE_RULES[id], severity))
    .map(([id]) => id)

/** How many js plugins each fragment's preset registers: exactly one, its own. */
const leafPluginCounts = (): readonly number[] => LEAF_FRAGMENTS.map((leaf) => leaf.preset.jsPlugins.length)

describe('pre-change pin', () => {
  it('Should_SplitIntoSeventeenAggregateAndFortyOneDmmfKeys_When_ThePreChangeMapIsPinned', () => {
    const keys = Object.keys(PRE_CHANGE_RULES)
    expect(keys.filter((key) => key.startsWith('@systemfsoftware/oxlint-plugin/'))).toHaveLength(17)
    expect(keys.filter((key) => key.startsWith('@systemfsoftware/oxlint-plugin-effect-dmmf/'))).toHaveLength(41)
    expect(keys).toHaveLength(58)
  })

  it('Should_ReportNoDrift_When_ThePreChangeMapIsComparedWithItself', () => {
    const identity: Record<string, string> = {}
    for (const id of Object.keys(PRE_CHANGE_RULES)) identity[id] = id
    const parity = parityOf(resolveRules(PRE_CHANGE_BASE), PRE_CHANGE_RULES, identity)
    expect(parity.mapped).toHaveLength(58)
    expect(parity.mismatched).toStrictEqual([])
    expect(parity.dropped).toStrictEqual([])
    expect(parity.added).toStrictEqual([])
    expect(parity.unrekeyed).toStrictEqual([])
  })

  it('Should_CoverEveryPreChangeCustomId_When_TheReKeyTableIsApplied', () => {
    expect(Object.keys(ID_MAPPING).sort()).toStrictEqual(Object.keys(PRE_CHANGE_RULES).sort())
  })

  it('Should_PinFourAbsentRules_When_TheAsymmetryFixIsTheOnlyIntendedDelta', () => {
    expect(ASYMMETRY_IDS).toHaveLength(4)
    expect(ASYMMETRY_IDS.filter((id) => Object.hasOwn(PRE_CHANGE_RULES, id))).toStrictEqual([])
    expect(ASYMMETRY_IDS.filter((id) => Object.values(ID_MAPPING).includes(id))).toStrictEqual([])
  })
})

describe('base preset parity gate', () => {
  it('Should_ExtendTheNineLeafFragments_When_ThePluginsSelfRegister', () => {
    expect(BASE_EXTENDS.map((entry) => entry.rules)).toStrictEqual(LEAF_FRAGMENTS.map((leaf) => leaf.preset.rules))
    expect(leafPluginCounts()).toStrictEqual([1, 1, 1, 1, 1, 1, 1, 1, 1])
    // @ts-expect-error runtime guard against a key the config type does not declare
    expect(base.jsPlugins).toBeUndefined()
  })

  it('Should_ResolveSixtyEightCustomKeysUnderALeafNamespace_When_TheAggregatesAreGone', () => {
    expect(baseCustomIds()).toHaveLength(68)
    expect(orphanedCustomIds(baseCustomIds())).toStrictEqual([])
  })

  it('Should_NameARuleTheOwningPluginDeclares_When_TheConfigLoads', () => {
    expect(unknownCustomIds(baseCustomIds())).toStrictEqual([])
  })

  it('Should_MapEveryPreChangeRuleOntoOneResolvedRule_When_TheLeafFragmentsCarryIt', () => {
    const parity = parityOf(RESOLVED_BASE_RULES, PRE_CHANGE_RULES, ID_MAPPING)
    expect(parity.mapped).toHaveLength(58)
    expect(parity.mismatched).toStrictEqual([])
    expect(parity.dropped).toStrictEqual([])
    expect(parity.unrekeyed).toStrictEqual([])
  })

  it('Should_AddOnlyTheFourAsymmetryRules_When_TheFragmentsSelfRegister', () => {
    const parity = parityOf(RESOLVED_BASE_RULES, PRE_CHANGE_RULES, ID_MAPPING)
    expect(parity.added).toStrictEqual([...ASYMMETRY_IDS].sort())
  })

  it('Should_KeepTheStockDeltasVerbatim_When_TheLeafFragmentsOwnTheCustomRules', () => {
    expect(stockRuleDrift()).toStrictEqual([])
  })

  it('Should_DeclareOnlyTheThreeOwnCustomLiterals_When_TheFragmentsOwnTheRest', () => {
    expect([...customIds(BASE_RULES)].sort()).toStrictEqual(Object.keys(OWN_CUSTOM_RULES).sort())
    expect(ownCustomRuleDrift()).toStrictEqual([])
  })

  it('Should_ReKeyTheOverrideBlocks_When_TheRulesMoveToTheirOwningLeaves', () => {
    expect(base.overrides).toStrictEqual([
      {
        files: ['**/*.test.ts', '**/*.spec.ts'],
        rules: { ...TEST_FILE_OVERRIDE_RULES },
      },
      {
        files: ['**/fixtures/**', '**/__fixtures__/**', '**/testResources/**'],
        rules: { ...FIXTURE_OVERRIDE_RULES },
      },
    ])
  })

  it('Should_KeepTheIgnorePatternsVerbatim_When_TheFragmentsOwnTheRules', () => {
    expect(base.ignorePatterns).toStrictEqual([...IGNORE_PATTERNS])
  })
})
