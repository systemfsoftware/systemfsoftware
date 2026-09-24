export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECT = 'expect' as const
export const VITEST_SOURCE = 'vitest' as const
export const EFFECT_VITEST_SOURCE = '@effect/vitest' as const

export const VIOLATION_NAME = 'expect imported from vitest' as const

export const VIOLATION_EXPECTED = 'expect imported from @effect/vitest' as const

export const VIOLATION_ACTUAL = 'expect named in an import from vitest' as const

export const VIOLATION_FIX = 'import { expect } from @effect/vitest instead of vitest' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every test imports expect from @effect/vitest. An ImportSpecifier naming expect in an import from vitest is refused; any other vitest import stays legal.',
  },
  schema: [],
  messages: {
    vitestExpect: MESSAGE,
  },
} as const
