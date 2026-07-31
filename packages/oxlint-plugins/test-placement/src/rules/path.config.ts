export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['tests', '__tests__'])

export const PROPERTY_SUFFIX = '.property.test.ts' as const
export const INTEGRATION_SUFFIX = '.integration.test.ts' as const
export const FEATURE_SUFFIX = '.feature.test.ts' as const

/**
 * The one test file the taxonomy sanctions by name rather than by suffix: the
 * entry point that imports `virtual:@systemfsoftware/schema-laws`, whose
 * generated `ruleOfSchemas` pair covers every exported schema in the package.
 */
export const SCHEMA_LAWS_BASENAME = 'schema-laws.test.ts' as const

/**
 * Forbidden outright. A schema's laws are generated, so a hand-written
 * `*.schema.test.ts` only ever restates coverage that already exists.
 */
export const SCHEMA_SUFFIX = '.schema.test.ts' as const

/**
 * The cells the matrix grants authored property tests. `schema` is absent by
 * design: a schema carries no authored test at all — `SCHEMA_LAWS_BASENAME`
 * generates its laws.
 */
export const PROPERTY_CELLS = ['workflow', 'policy'] as const

export const GHERKIN_PACKAGE = '@systemfsoftware/effect-gherkin-spec' as const

export const FOREIGN_RUNNERS: ReadonlySet<string> = new Set(['vitest', '@effect/vitest'])

export const RUNNER_NAMES: ReadonlySet<string> = new Set(['it', 'test', 'describe'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
