import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DESCRIPTION_NAMESPACE = 'Cell' as const

export const MODULE_SOURCE: string = Cell.vocabulary.module

export const RUN_NAME: string = Cell.vocabulary.shell.run

if (Object.values(Cell.vocabulary.shell).some((name) => name.length === 0)) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the vocabulary reports an empty shell name, so this rule would decide nothing`,
  )
}

export const TWO_RUN_CHAIN_FIX =
  `compose the Cells with Cell.${Cell.vocabulary.shell.andThen} (or Cell.${Cell.vocabulary.shell.zip}) and Cell.${Cell.vocabulary.shell.run} once` as const

export const EFFECT_NAMESPACE = 'Effect' as const
export const EFFECT_SOURCES: readonly string[] = ['effect/Effect', 'effect'] as const
export const PIPE_NAME = 'pipe' as const
export const PIPE_SOURCES: readonly string[] = ['effect', 'effect/Function'] as const
export const CONTINUATION_NAMES: readonly string[] = ['flatMap', 'andThen', 'map', 'tap'] as const

export const TWO_RUN_CHAIN_EXPECTED =
  'a function body where each Cell.run input is independently sourced, not an identifier whose binding in the same function body is the success of a prior Cell.run' as const

export const TWO_RUN_CHAIN_ACTUAL =
  'a second Cell.run in the same function body whose input argument is an identifier — or a member expression rooted at one — whose binding in that same body is the success of an earlier Cell.run' as const

export const TWO_RUN_CHAIN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report a second Cell.run in one function body whose input flows from the success of an earlier Cell.run in that same body — including destructured bindings, Effect flatMap/andThen/map/tap callbacks on a run-rooted chain, and both data-first and pipe-curried data-last forms. Message states the exact syntactic reach; packed-object indirection, reassignment, closure capture, imported helpers, aliased Cell.run bindings, and the self.run method form are not followed.',
  },
  schema: [Options],
  messages: {
    twoRunChain: TWO_RUN_CHAIN_MESSAGE,
  },
} as const
