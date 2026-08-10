export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['__tests__'])

/**
 * The only test location sanctioned under `src/`. A property test earns
 * colocation with the cell it covers, but not adjacency: it lives in a
 * `__tests__` directory beside that cell, never as a sibling file.
 */
export const NESTED_TEST_DIR = '__tests__' as const

export const PROPERTY_SUFFIX = '.property.test.ts' as const
export const INTEGRATION_SUFFIX = '.integration.test.ts' as const

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
 * The cells a colocated test may cover. A test whose stem names one of these
 * is legal beside the cell it covers, in whichever form the author needs; a
 * test naming any other cell is not, because those cells are covered at
 * composition altitude. This list sanctions a form — it never requires one.
 * Requiring a test is the `cellsRequiringTest` option on
 * `src-property-test-cell`, which a consumer opts into per cell.
 *
 * `kernel` is admitted because a kernel is domain-blind pure behaviour whose
 * laws are algebraic: every mutant is either a broken law or genuinely
 * equivalent, which is the ideal property-test target. AGENTS.md REPO-S5
 * already gates kernels "by colocated K-law property tests" — omitting the
 * suffix here made that sanctioned path unreachable, so kernel properties were
 * written inside `import.meta.vitest` blocks instead, where the mutation
 * contribution gate (which judges by filename) cannot see them.
 *
 * `schema` is admitted for ONE purpose: refusal. The generated laws draw from
 * each schema's own arbitrary, so every input already satisfies the refinement
 * under test — no law can state what a schema REJECTS. This module rules on
 * the filename only; what may appear inside the file is not its concern.
 */
export const COLOCATABLE_CELLS = ['workflow', 'policy', 'schema', 'kernel'] as const

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

export const ABSENCE_MESSAGE =
  '{{name}} is untested. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
