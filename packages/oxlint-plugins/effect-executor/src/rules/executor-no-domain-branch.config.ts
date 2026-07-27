import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MATCH_NAMESPACE = 'Match' as const

export const MATCH_ENTRY_METHOD = 'value' as const

export const TAG_PROPERTY = '_tag' as const

export const INPUT_CELLS = ['acl', 'store'] as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const UNWRAPPED_BY_TYPE: Readonly<Record<string, string>> = {
  MemberExpression: 'object',
  CallExpression: 'callee',
  AwaitExpression: 'argument',
  YieldExpression: 'argument',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
}

export const MATCH_ON_INPUT_ACTUAL = 'exhaustive dispatch over a decoded input' as const
export const MATCH_ON_INPUT_EXPECTED = 'the shell to translate a decision, never to reach one' as const
export const MATCH_ON_INPUT_FIX =
  'pass the decoded value into the *.workflow.ts as a command field and dispatch on the decision it returns' as const

export const BRANCH_ACTUAL_IF = 'an if branching on a decoded input tag' as const
export const BRANCH_ACTUAL_TERNARY = 'a ternary branching on a decoded input tag' as const
export const BRANCH_ACTUAL_SWITCH = 'a switch branching on a decoded input tag' as const

export const BRANCH_EXPECTED = 'branching on domain state only inside the workflow' as const
export const BRANCH_FIX =
  'pass the decoded value into the *.workflow.ts and let it dispatch exhaustively; the executor translates the decision it returns' as const

export const MATCH_ON_INPUT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BRANCH_ON_INPUT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban deciding on decoded input in *.executor.ts: no Match.value over a value derived from an ACL or store call, and no if/ternary/switch reading a _tag on one. Dispatching over the decision a workflow returned is translation and stays allowed.',
  },
  schema: [Options],
  messages: {
    matchOnInputState: MATCH_ON_INPUT_MESSAGE,
    branchOnInputState: BRANCH_ON_INPUT_MESSAGE,
  },
} as const
