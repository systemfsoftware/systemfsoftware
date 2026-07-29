export const TEST_BASENAME = /\.(?:test|spec)\.[cm]?tsx?$/

export const SANCTIONED_TEST_DIRS: ReadonlySet<string> = new Set(['tests', '__tests__'])

export const PROPERTY_SUFFIX = '.property.test.ts' as const
export const INTEGRATION_SUFFIX = '.integration.test.ts' as const
export const FEATURE_SUFFIX = '.feature.test.ts' as const

export const PROPERTY_CELLS = ['workflow', 'schema', 'policy'] as const

export const GHERKIN_PACKAGE = '@systemfsoftware/effect-gherkin-spec' as const

export const FOREIGN_RUNNERS: ReadonlySet<string> = new Set(['vitest', '@effect/vitest'])

export const RUNNER_NAMES: ReadonlySet<string> = new Set(['it', 'test', 'describe'])

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
