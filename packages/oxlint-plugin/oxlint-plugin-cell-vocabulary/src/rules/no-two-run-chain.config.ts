import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The export name of the description vocabulary on its own module. A Cell is
 * recognised by an import from `Cell.vocabulary.module`; among that module's
 * exports only this one carries `run`, so a named import of any other export
 * (Policy, Workflow) must not be treated as a Cell namespace.
 */
export const CELL_NAMESPACE = 'Cell' as const

export const MODULE_SOURCE: string = Cell.vocabulary.module

export const EFFECT_SOURCES = ['effect', 'effect/Effect'] as const

export const EFFECT_NAMESPACE = 'Effect' as const

export const RUN_METHOD = 'run' as const

export const GEN_METHOD = 'gen' as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const TWO_RUN_CHAIN_EXPECTED = 'one exported Cell that composes its stages with Cell.andThen' as const

export const TWO_RUN_CHAIN_ACTUAL =
  'a later Cell.run in the same Effect.gen body whose input reuses a value bound from an earlier Cell.run result' as const

export const TWO_RUN_CHAIN_FIX =
  'compose the stages with Cell.andThen into one exported Cell and interpret it once at the composition root, deleting the Effect.gen sequencing' as const

export const TWO_RUN_CHAIN_MESSAGE =
  '{{chainedOn}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report a Cell.run whose input reuses a value bound from an earlier Cell.run result in the same Effect.gen generator body — directly, through a local alias, as a member-expression root, or as an object-literal property value. Single runs, runs sharing one independent input, runs in separate generator bodies, and non-canonical Cell spellings stay silent; gen-free flatMap chains are out of scope and stay silent.',
  },
  schema: [Options],
  messages: {
    twoRunChain: TWO_RUN_CHAIN_MESSAGE,
  },
} as const
