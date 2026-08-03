export const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/
export const EXPECT = 'expect'

export const BEHAVIOUR_NODES: Record<string, true> = {
  AwaitExpression: true,
  CallExpression: true,
  NewExpression: true,
  TaggedTemplateExpression: true,
}

// Fields the walker should not descend into: type is the discriminant,
// loc/range are positions, parent is the cycle back-pointer.
export const SKIP_WALK_KEYS = new Set(['type', 'loc', 'range', 'parent'])

export const BEHAVIOURLESS_ASSERTION_MESSAGE = 'Expected: an assertion over a value the code under test produced. ' +
  'Actual: both sides are built only from imported declarations and literals, so this calls nothing and ' +
  'cannot fail on any behaviour change. ' +
  'Fix: assert the output of the function under test, or delete this — mutation score is computed over ' +
  'mutants, not tests, so a worthless test leaves it untouched and nothing else will catch this.'

export const meta = {
  type: 'problem',
  docs: {
    description: 'Flag an assertion whose subject and expectation are both built only from imported declarations and ' +
      'literals. Such an assertion invokes nothing, so no change to the behaviour under test can make it fail.',
  },
  schema: [],
  messages: {
    behaviourlessAssertion: BEHAVIOURLESS_ASSERTION_MESSAGE,
  },
} as const
