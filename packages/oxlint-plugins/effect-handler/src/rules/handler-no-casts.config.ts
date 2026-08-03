import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const AS_ASSERTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ANGLE_BRACKET_ASSERTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban type assertions in *.handler.ts files. The request must be decoded through a Schema codec (HttpServerRequest.schemaBodyJson, S.decodeUnknownSync, ...), never cast. The single exemption is `as const`, which narrows a literal and asserts nothing about untrusted data.',
  },
  schema: [Options],
  messages: {
    asAssertion: AS_ASSERTION_MESSAGE,
    angleBracketAssertion: ANGLE_BRACKET_ASSERTION_MESSAGE,
  },
} as const
