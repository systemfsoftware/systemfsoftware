export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NAME = 'a recursive schema union whose cycle carries six or more suspend-wrapped members' as const

export const EXPECTED =
  'recursion the arbitrary derivation can terminate in one pass: one Schema.suspend at the recursion point, or a declared budget' as const

export const actualWithSuspends = (count: number): string =>
  `${count} Schema.suspend members sit on the same recursive cycle, so the derivation re-walks the terminal branch once per suspend — measured 8 ms at four members, 222 ms at six, and 52.6 s at eight`

export const FIX =
  'hoist the cycle to one Schema.suspend at the recursion point, so the members reference the union schema directly, and declare the ceiling with recursionBudget in its annotation' as const

export const UNBUDGETED_NAME = 'a recursion point whose suspension declares no generation budget' as const

export const UNBUDGETED_EXPECTED =
  'a ceiling the generated values stay inside, declared on the suspension that breaks the cycle' as const

export const UNBUDGETED_ACTUAL =
  'the suspension returns a union that reaches itself, so the derivation stops at the stock per-suspension ceiling and the schema never generates the deep values its recursion describes' as const

export const UNBUDGETED_FIX =
  "annotate the suspension with recursionBudget: { maxDepth, depthSize }, as in Schema.suspend(() => Schema.Union([...])).annotate({ recursionBudget: { maxDepth: 6, depthSize: 'small' } })" as const

export const SUSPEND_BUDGET_THRESHOLD = 6 as const

export const SUSPEND_MEMBER = 'suspend' as const

export const UNION_MEMBER = 'Union' as const

export const ANNOTATE_MEMBER = 'annotate' as const

export const ANNOTATION_MEMBER = 'toArbitrary' as const

export const BUDGET_MEMBER = 'recursionBudget' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A recursive Effect Schema union derives superlinearly when six or more suspend-wrapped members sit on its cycle, and stops at the stock ceiling when its recursion point declares no generation budget; both shapes are reported.',
  },
  schema: [],
  messages: {
    recursiveUnionBudget: MESSAGE,
    unbudgetedRecursionUnion: MESSAGE,
  },
} as const
