export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['tests', '__tests__'])

export const PROPERTY_SUFFIX = '.property.test.ts' as const
export const INTEGRATION_SUFFIX = '.integration.test.ts' as const

/**
 * A snapshot test deterministically samples an annotated arbitrary under a
 * fixed seed and asserts the resulting bytes against a stored fixture. Its
 * purpose is to catch regressions in the SHAPE the arbitrary emits (depth
 * bounding, variant distribution, recursion cuts) — not behavioural
 * correctness — so it sits outside the Gherkin feature machinery and outside
 * the property-test predicate contract.
 */
export const SNAPSHOT_SUFFIX = '.snapshot.test.ts' as const

/**
 * The suffixes `test-suffix-outside-src` admits for files outside `src/`.
 *
 * `BEHAVIOUR_SUFFIXES` is the strict subset of test files that must drive a
 * real use case through the I/O sandwich — only `*.integration.test.ts`
 * qualifies. A snapshot test does NOT, so it deliberately does not appear in
 * `BEHAVIOUR_SUFFIXES` and the four `behaviour-*` rules are untouched by
 * it. `SANCTIONED_OUTSIDE_SRC_SUFFIXES` is the broader gate that admits
 * snapshot tests for placement only.
 */
export const SANCTIONED_OUTSIDE_SRC_SUFFIXES: ReadonlyArray<string> = [INTEGRATION_SUFFIX, SNAPSHOT_SUFFIX]

/**
 * One behaviour suffix. The composition/integration split is retired: a
 * behaviour test is a behaviour test, and whether it doubles at a port is a
 * judgement the suffix no longer encodes. Snapshot tests are NOT behaviour
 * tests — they exist to pin the shape of a fixed-seed sample against a
 * stored fixture, not to drive a use case.
 */
export const BEHAVIOUR_SUFFIXES: ReadonlyArray<string> = [INTEGRATION_SUFFIX]

/**
 * The one test file the taxonomy sanctions by name rather than by suffix: the
 * entry point the schema-laws Vite plugin rewrites, whose generated
 * `ruleOfSchemas` pair covers every exported schema in the package.
 */
export const SCHEMA_LAWS_BASENAME = 'schema-laws.test.ts' as const

/**
 * Forbidden outright. A schema's laws are generated, so a hand-written
 * `*.schema.test.ts` only ever restates coverage that already exists.
 */
export const SCHEMA_SUFFIX = '.schema.test.ts' as const

/**
 * The cells the matrix grants authored property tests.
 *
 * `schema` is admitted for ONE purpose: refusal. The generated laws draw from
 * each schema's own arbitrary, so every input already satisfies the refinement
 * under test — no law can state what a schema REJECTS. This module rules on
 * the filename only; what may appear inside the file is not its concern.
 */
export const PROPERTY_CELLS = ['workflow', 'policy', 'schema'] as const

export const PURE_CELL_SUFFIXES: ReadonlyArray<string> = [
  '.kernel',
  '.workflow',
  '.schema',
  '.acl',
]

export const SHELL_CELL_SUFFIXES: ReadonlyArray<string> = [
  '.executor',
  '.handler',
  '.adapter',
  '.store',
  '.middleware',
]

export const SHELL_ENTRY_BASENAMES: ReadonlySet<string> = new Set([
  'main',
  'mod',
  'index',
])

export const DOUBLE_BASENAME_PATTERN: RegExp = /(?:^|[^a-z])(?:fake|stub|mock|noop)(?:[^a-z]|$)/

export const GHERKIN_PACKAGE = '@systemfsoftware/effect-gherkin-spec' as const

export const FOREIGN_RUNNERS: ReadonlySet<string> = new Set(['vitest', '@effect/vitest'])

export const RUNNER_NAMES: ReadonlySet<string> = new Set(['it', 'test', 'describe'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
