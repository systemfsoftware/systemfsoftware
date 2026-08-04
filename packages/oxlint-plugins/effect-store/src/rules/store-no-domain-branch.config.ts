import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MATCH_NAMESPACE = 'Match' as const

export const MATCH_ENTRY_METHOD = 'value' as const

export const TAG_PROPERTY = '_tag' as const

export const INPUT_CELLS: readonly string[] = ['acl'] as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const UNWRAPPED_BY_TYPE: Readonly<Record<string, string>> = {
  MemberExpression: 'object',
  CallExpression: 'callee',
  AwaitExpression: 'argument',
  YieldExpression: 'argument',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
}

export const MATCH_ON_INPUT_ACTUAL = 'exhaustive dispatch over a decoded value' as const

export const MATCH_ON_INPUT_EXPECTED = 'the store to persist, never to dispatch on decoded state' as const

export const MATCH_ON_INPUT_FIX =
  'let the workflow dispatch on the decoded value and persist the decision it returns' as const

export const BRANCH_ACTUAL_IF = 'a branch on a domain-typed _tag' as const
export const BRANCH_ACTUAL_TERNARY = 'a branch on a domain-typed _tag' as const
export const BRANCH_ACTUAL_SWITCH = 'a branch on a domain-typed _tag' as const

export const BRANCH_EXPECTED = 'data-integrity existence checks only — domain branches live in the workflow' as const

export const BRANCH_FIX =
  'move the branch into the *.workflow.ts — the store receives already-decided data and persists it' as const

export const MATCH_ON_INPUT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BRANCH_ON_INPUT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban deciding in *.store.ts: no Match.value over an ACL-derived value, and no if/ternary/switch branching on a domain-typed _tag. Existence checks on branded optionals stay allowed — they never read _tag.',
  },
  schema: [Options],
  messages: {
    matchOnInputState: MATCH_ON_INPUT_MESSAGE,
    branchOnInputState: BRANCH_ON_INPUT_MESSAGE,
  },
} as const
