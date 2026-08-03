import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const GATE_FAIL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In *.middleware.ts files, a decode-failure branch must produce Effect.fail — the gate short-circuits at the edge — never Effect.succeed of an Option or nullable, which would force every downstream handler to re-check the invalid state (architect-middleware MW3).',
  },
  schema: [Options],
  messages: {
    gateFail: GATE_FAIL_MESSAGE,
  },
} as const
