export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['tests', '__tests__'])

export const PROPERTY_SUFFIX = '.property.test.ts' as const
export const SCHEMA_SUFFIX = '.schema.test.ts' as const
export const INTEGRATION_SUFFIX = '.integration.test.ts' as const
export const FEATURE_SUFFIX = '.feature.test.ts' as const

/**
 * The cells the matrix grants authored property tests. `schema` is absent by
 * design: a schema cell's laws are the generated `ruleOfSchemas` pair, which
 * lives in the cell's `*.schema.test.ts` alongside its refinement examples.
 */
export const PROPERTY_CELLS = ['workflow', 'policy'] as const

export const GHERKIN_PACKAGE = '@systemfsoftware/effect-gherkin-spec' as const

export const FOREIGN_RUNNERS: ReadonlySet<string> = new Set(['vitest', '@effect/vitest'])

export const RUNNER_NAMES: ReadonlySet<string> = new Set(['it', 'test', 'describe'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
