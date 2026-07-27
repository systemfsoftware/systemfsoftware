import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SINGLE_PATH_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const BRANCHING_NAMES = {
  IfStatement: 'if',
  SwitchStatement: 'switch',
} as const

export const ITERATION_KEYWORDS = {
  ForStatement: 'for',
  ForInStatement: 'for-in',
  ForOfStatement: 'for-of',
  WhileStatement: 'while',
  DoWhileStatement: 'do-while',
} as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Enforce cyclomatic complexity 1 in *.workflow.ts files: exhaustive Match dispatch, at most one converging ternary, and no loops.',
  },
  schema: [Options],
  messages: {
    branchingStatement: SINGLE_PATH_MESSAGE,
    iterationStatement: SINGLE_PATH_MESSAGE,
    excessTernary: SINGLE_PATH_MESSAGE,
  },
} as const
