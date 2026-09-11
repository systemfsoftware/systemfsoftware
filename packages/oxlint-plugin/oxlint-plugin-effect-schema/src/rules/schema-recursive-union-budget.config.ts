export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NAME = 'a recursive schema union whose cycle carries six or more suspend-wrapped members' as const

export const EXPECTED =
  'recursion the arbitrary derivation can terminate in one pass: one Schema.suspend at the recursion point, or a declared budget' as const

export const actualWithSuspends = (count: number): string =>
  `${count} Schema.suspend members sit on the same recursive cycle, so the derivation re-walks the terminal branch once per suspend — measured 8 ms at four members, 222 ms at six, and 52.6 s at eight`

export const FIX =
  'hoist the cycle to a single Schema.suspend at the recursion point, so the members reference the union schema directly, or declare the budget with terminatingRecursion from @systemfsoftware/effect-schema-recursion-budget' as const

export const SUSPEND_BUDGET_THRESHOLD = 6 as const

export const SUSPEND_MEMBER = 'suspend' as const

export const ANNOTATION_MEMBER = 'toArbitrary' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A recursive Effect Schema union whose cycle carries six or more suspend-wrapped members derives arbitrary values superlinearly: hoist to one Schema.suspend at the recursion point or declare the budget with terminatingRecursion.',
  },
  schema: [],
  messages: {
    recursiveUnionBudget: MESSAGE,
  },
} as const
