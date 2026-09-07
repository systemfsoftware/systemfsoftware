import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MODULE_SOURCE: string = Cell.vocabulary.module

export const DESCRIPTION_NAMESPACE = 'Cell' as const

export const RUN_MEMBER = 'run' as const

export const LAYER_MEMBER = 'layer' as const

export const PROVIDE_SERVICE_MEMBER = 'provideService' as const

export const PIPE_MEMBER = 'pipe' as const

export const PIPE_FUNCTION = 'pipe' as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const LAUNDERED_CELL_SERVICE_EXPECTED =
  'a Cell.run whose services ride the Cell R channel — the provide belongs at the service construction layer or in Cell.provide, never piped onto a per-call run' as const

export const LAUNDERED_CELL_SERVICE_ACTUAL =
  'a provideService piped onto Cell.run hands the run a service its own Cell R already demands, inside a per-call closure' as const

export const LAUNDERED_CELL_SERVICE_FIX =
  'hoist the provide to the surrounding service construction layer, or declare the service in the Cell R and eliminate it once with Cell.provide at the composition root; when the service is genuinely per-event, drop the Cell.run and keep the raw Effect provide; when nothing consumes the provided value, delete it' as const

export const LAUNDERED_CELL_SERVICE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report a provideService piped onto Cell.run that hands the run a service the Cell declared R already demands, inside a per-call closure. Top-level Program-scope provisioning and provides on raw Effect values stay silent; an unresolvable R fails open.',
  },
  schema: [Options],
  messages: {
    launderedCellService: LAUNDERED_CELL_SERVICE_MESSAGE,
  },
} as const
