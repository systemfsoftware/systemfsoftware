import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SWITCH_STATEMENT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban switch statements in *.handler.ts files. Error-to-status mapping must go through Match.tag closed by Match.orElse(() => 500); a switch on _tag is banned by the case-on-tagged-union lint and is easy to leave incomplete.',
  },
  schema: [Options],
  messages: {
    switchStatement: SWITCH_STATEMENT_MESSAGE,
  },
} as const
