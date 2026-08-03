import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const AS_ASSERTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ANGLE_BRACKET_ASSERTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CAST_EXPECTED =
  'S.decodeUnknown at the foreign boundary — the decode is the only way a driver payload enters the port' as const

export const CAST_FIX =
  "decode driver DATA with S.decodeUnknown(Shape)(raw), mapping failures to the port's typed error; when the driver's own TYPE is wrong — an overload that will not narrow, or a live handle that carries methods rather than data — correct it once in a .d.ts module augmentation pinned to the driver version, never at the callsite" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban type assertions in *.adapter.ts files. Foreign driver payloads must be decoded through S.decodeUnknown — a cast skips the boundary decode and lets the type system be lied to. The single exemption is `as const`, which narrows a literal and asserts nothing about untrusted data.',
  },
  schema: [Options],
  messages: {
    asAssertion: AS_ASSERTION_MESSAGE,
    angleBracketAssertion: ANGLE_BRACKET_ASSERTION_MESSAGE,
  },
} as const
