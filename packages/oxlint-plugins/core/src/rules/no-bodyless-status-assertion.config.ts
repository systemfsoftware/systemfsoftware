export const STATUS_MATCHERS: ReadonlySet<string> = new Set(['toBe', 'toEqual', 'toStrictEqual'])

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Forbids asserting an HTTP response status without surfacing the response body on failure. Use checkResponseWithBody so a mismatch reports the problem+json detail, not a bare "expected 402 to be 200".',
  },
  schema: [],
  messages: {
    bodylessStatusAssertion:
      'Asserting `.status` against {{status}} with `expect` discards the response body; a failure shows only the status codes. Replace with `await checkResponseWithBody(<response>, {{status}})`.',
    preferCheckResponseWithBody:
      '`checkResponse` reports only the status codes on failure. Replace with `await checkResponseWithBody(...)` to surface the response body in the assertion message.',
  },
} as const
