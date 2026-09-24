export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const VITEST_SOURCE = 'vitest' as const

export const VIOLATION_NAME = 'a value import from vitest' as const

export const VIOLATION_EXPECTED =
  'every test value imported from @effect/vitest, which re-exports all of Vitest' as const

export const VIOLATION_ACTUAL = 'a named, namespace, default, side-effect or dynamic value import from vitest' as const

export const VIOLATION_FIX = 'import it from @effect/vitest instead of vitest' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every value a test uses from Vitest is imported from @effect/vitest, which re-exports all of Vitest. Any value import from vitest — named, namespace, default, side-effect or dynamic — is refused; a type-only import stays legal.',
  },
  schema: [],
  messages: {
    vitestImport: MESSAGE,
  },
} as const
