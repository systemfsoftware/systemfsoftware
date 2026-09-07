import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const CELL_NAMESPACE = 'Cell' as const

export const MODULE_SOURCE: string = Cell.vocabulary.module

export const EFFECT_SOURCES = ['effect', 'effect/Effect'] as const

export const EFFECT_NAMESPACE = 'Effect' as const

export const RUN_METHOD = 'run' as const

export const PROVIDE_SERVICE_METHOD = 'provideService' as const

export const PROVIDE_SERVICE_ON_RUN_EXPECTED =
  'a cell whose phases yield the service so it rides the R channel' as const

export const PROVIDE_SERVICE_ON_RUN_ACTUAL =
  'an Effect.provideService captured onto a Cell.run-rooted chain, as a direct argument or a pipe argument' as const
export const PROVIDE_SERVICE_ON_RUN_FIX =
  'let the cell phases yield the service so it rides R, then provide the host layer once via Cell.provide at the composition root' as const

export const PROVIDE_SERVICE_ON_RUN_MESSAGE =
  '{{service}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report Effect.provideService applied as a direct argument of a Cell.run call or as a pipe argument on a Cell.run-rooted pipe chain. Cell.provide, Layer.provide, Effect.provide, chains not rooted in Cell.run, non-canonical Effect spellings, and intermediate-variable routing stay silent; the intermediate-variable form is out of reach.',
  },
  schema: [Options],
  messages: {
    provideServiceOnRun: PROVIDE_SERVICE_ON_RUN_MESSAGE,
  },
} as const
