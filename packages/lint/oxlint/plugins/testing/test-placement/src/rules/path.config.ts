export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['tests'])

/**
 * The package-root test trees whose entire subtree binds the public API.
 * Every file under `tests/` or `__tests__/`, at any depth and regardless of
 * basename, may not relative-import `src` or climb into an `internal` folder.
 */
export const TEST_TREE_DIRS: ReadonlySet<string> = new Set(['tests', '__tests__'])

/**
 * The only test location sanctioned under `src/`. A workflow property test
 * earns colocation with the workflow it covers, but not adjacency: it lives in
 * a `__tests__` directory beside that workflow, never as a sibling file.
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
 * The one property-test basename sanctioned under `src/`: a single-segment
 * stem, then `.workflow.property.test.ts`, beside the `<stem>.workflow.ts` it
 * covers. Every other test file under `src/` is banned; a kernel, policy, or
 * schema suite has no file home and becomes an in-source `import.meta.vitest`
 * block in the module it covers.
 */
export const WORKFLOW_TEST_BASENAME = /^[^.]+\.workflow\.property\.test\.ts$/

export const DOUBLE_BASENAME_PATTERN: RegExp = /(?:^|[^a-z])(?:fake|stub|mock|noop)(?:[^a-z]|$)/

export const GHERKIN_PACKAGE = '@systemfsoftware/effect-gherkin-spec' as const

export const FOREIGN_RUNNERS: ReadonlySet<string> = new Set(['vitest', '@effect/vitest'])

export const RUNNER_NAMES: ReadonlySet<string> = new Set(['it', 'test', 'describe'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ABSENCE_MESSAGE =
  '{{name}} is untested. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
