import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SANDWICH_SOURCE = '@systemfsoftware/effect-cell-types' as const

export const SANDWICH_OWNER = 'Sandwich' as const

export const SHELL_CONTROL_NAME: Readonly<Record<string, string>> = {
  IfStatement: 'an if statement in a Sandwich shell phase',
  SwitchStatement: 'a switch statement in a Sandwich shell phase',
  ConditionalExpression: 'a ternary expression in a Sandwich shell phase',
  ForStatement: 'a for loop in a Sandwich shell phase',
  ForInStatement: 'a for-in loop in a Sandwich shell phase',
  ForOfStatement: 'a for-of loop in a Sandwich shell phase',
  WhileStatement: 'a while loop in a Sandwich shell phase',
  DoWhileStatement: 'a do-while loop in a Sandwich shell phase',
}

export const shellControlName = (nodeType: string): string | undefined => SHELL_CONTROL_NAME[nodeType]

export const SHELL_LOGICAL_NAME = 'an && or || value short-circuit in a Sandwich shell phase' as const

export const SHELL_EXPECTED =
  'a straight-line shell phase: the read gathers state and the write executes the decided commands in order, with every branch already taken by the cell\u2019s decide workflow' as const

export const shellControlActual = (phase: string): string =>
  `a control-flow construct inside the ${phase} phase of a Sandwich cell`

export const SHELL_CONTROL_FIX =
  'move the branch into the cell\u2019s decide workflow as a decision variant dispatched with Match.exhaustive, and keep the phase straight-line' as const

export const MATCH_NAME = 'a Match pipeline in a Sandwich shell phase' as const

export const MATCH_ACTUAL = 'a Match.value or Match.type pipeline inside a read or write phase' as const

export const MATCH_FIX =
  'route the dispatch through the cell\u2019s decide workflow \u2014 the phases run one path' as const

export const CLOCK_NAME = 'a Clock read in a Sandwich write phase' as const

export const CLOCK_EXPECTED = 'a write phase that reads no clock: the read phase is where time is gathered' as const

export const CLOCK_ACTUAL = 'a Clock reference inside the write phase' as const

export const CLOCK_FIX =
  'read the clock in the cell\u2019s read phase and pass the timestamp to decide and write as data' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Refuse control flow, Match pipelines, and clock reads inside the read and write phases of a Sandwich cell: the shell phases are straight-line',
  },
  schema: [],
  messages: {
    controlFlowInShell: MESSAGE,
    matchPipelineInShell: MESSAGE,
    clockReadInWrite: MESSAGE,
  },
} as const
