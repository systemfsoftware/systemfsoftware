export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const VIOLATION_NAME = 'a hand-rolled recursive schema fixture inside a test block' as const

export const EXPECTED =
  'a recursive fixture schema enters the block through a named local builder call, or its recursion point declares its generation with a visible toArbitrary derivation or a recursionBudget ceiling' as const

export const ACTUAL =
  'the union and its recursion cycle are assembled inline, so the suite exercises a surrogate universe the shipped schema contract never declared and no budget gate grades' as const

export const FIX =
  "hoist the members into a named builder the annotated and counterfactual fixtures share, or declare the recursion point's generation in its annotation" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an import.meta.vitest in-source block or a *.test.ts file, a recursive schema union must enter through a named local builder or an imported helper, or its recursion point must declare its generation with a visible toArbitrary derivation or recursionBudget ceiling. An inline hand-rolled recursive union reports; outside test scope the rule is silent, because production schemas are the derivation-cost rule domain.',
  },
  schema: [],
  messages: {
    handRolledRecursiveFixture: MESSAGE,
  },
} as const
