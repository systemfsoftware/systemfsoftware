import type { RuleMeta } from '@oxlint/plugins'

export const HARNESS_FILE = /\.harness\.[cm]?ts$/

/**
 * A registration call executes the consumer's test runner when the module is
 * imported. A harness must let its consumer decide _when_ the tests register, so
 * these callees are banned at module scope by default. A project's own registration
 * entry points extend this list through the `callees` option.
 */
export const DEFAULT_REGISTRATION_CALLEES: ReadonlyArray<string> = ['RuleTester.run', 'describe', 'it']

export const EXPECTED = 'registration only inside a function the consumer invokes' as const

export const ACTUAL = 'a registration call evaluated when this harness module is imported' as const

export const FIX =
  'move the registration inside a function the consumer invokes; constructing harness structure at module scope is fine' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta: RuleMeta = {
  type: 'problem',
  docs: {
    description:
      "A .harness.ts file must not register tests (RuleTester.run, describe, it) at module scope - a harness that registers on import has stolen its consumer's decision about when the tests run. Construction at module scope is fine.",
  },
  schema: [
    {
      type: 'object',
      properties: {
        callees: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  ],
  defaultOptions: [{ callees: [...DEFAULT_REGISTRATION_CALLEES] }],
  messages: {
    moduleScopeRegistration: MESSAGE,
  },
}
