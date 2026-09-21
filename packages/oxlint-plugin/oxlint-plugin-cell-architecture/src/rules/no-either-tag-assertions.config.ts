export const EITHER_TAGS: ReadonlySet<unknown> = new Set(['Left', 'Right'])

export const TAG_MATCHERS: ReadonlySet<string> = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toContain',
  'toMatch',
])

export const ARRAY_METHODS: ReadonlySet<string> = new Set([
  'filter',
  'find',
  'findIndex',
  'some',
  'every',
  'map',
  'flatMap',
])

export const COMPARISON_OPS: ReadonlySet<string> = new Set(['===', '!==', '==', '!='])

export const meta = {
  type: 'problem',
  docs: {
    description: 'Ban Either _tag assertions in test files. Use expect().toEqual(Either.left/right(...)) instead.',
  },
  schema: [],
  messages: {
    expectTagMatcher:
      '{{name}} is forbidden. Expected: expect(result).toEqual(Either.left/right(...)). Actual: direct _tag assertion. Fix: Replace expect(X._tag).toBe("Left") with expect(X).toEqual(Either.left(...)).',
    tagComparison:
      '{{name}} is forbidden. Expected: expect(X).toEqual(Either.left/right(...)) or Either.isLeft/isRight guard. Actual: direct _tag comparison. Fix: Replace X._tag === "Left" with Either.isLeft(X) or expect(X).toEqual(Either.left(...)).',
    objectContainingTag:
      '{{name}} is forbidden. Expected: structured assertion without _tag. Actual: _tag inside expect.objectContaining. Fix: Remove _tag and assert the full Either value with expect(X).toEqual(Either.left/right(...)).',
    unwrapTagAccess:
      '{{name}} is forbidden. Expected: Either.getLeft/Either.getRight after guard or expect(X).toEqual(Either.left/right(...)). Actual: _tag on unwrapped property. Fix: Assert the full Either value instead.',
    typeGuardAssertion:
      '{{name}} is forbidden. Expected: expect(result).toEqual(Either.left/right(...)). Actual: Either type guard wrapped in expect(). Fix: Assert the full Either value directly.',
    switchOnTag:
      '{{name}} is forbidden. Expected: Either.match or expect().toEqual(Either.left/right(...)). Actual: switch on _tag. Fix: Use Either.match({ Left: ..., Right: ... }, value) or structured assertions.',
    computedTagAccess:
      '{{name}} is forbidden. Expected: expect(X).toEqual(Either.left/right(...)) or Either.isLeft/isRight guard. Actual: computed _tag access. Fix: Replace X["_tag"] === "Left" with expect(X).toEqual(Either.left(...)).',
    callbackTagAccess:
      '{{name}} is forbidden. Expected: Either.isLeft/isRight in callback. Actual: _tag access in array method callback. Fix: Use Either.isLeft/isRight for type narrowing.',
  },
  hasSuggestions: true,
} as const
