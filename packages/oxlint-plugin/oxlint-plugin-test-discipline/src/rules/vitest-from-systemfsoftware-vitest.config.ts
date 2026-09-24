export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const FOREIGN_VITEST_SOURCES: Record<string, true> = {
  'vitest': true,
  '@effect/vitest': true,
}

export const VIOLATION_NAME = 'a value import from a foreign vitest runner' as const

export const VIOLATION_EXPECTED =
  'every test value imported from @systemfsoftware/vitest, which re-exports all of Vitest' as const

export const VIOLATION_ACTUAL =
  'a named, namespace, default, side-effect or dynamic value import from vitest or @effect/vitest' as const

export const VIOLATION_FIX = 'import it from @systemfsoftware/vitest instead of vitest or @effect/vitest' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every value a test uses from Vitest is imported from @systemfsoftware/vitest, which re-exports all of Vitest. Any value import from vitest or the upstream @effect/vitest — named, namespace, default, side-effect or dynamic — is refused; a type-only import stays legal.',
  },
  schema: [],
  messages: {
    vitestImport: MESSAGE,
  },
} as const
