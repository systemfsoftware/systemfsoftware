import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})
export const MODULE_SOURCE: string = Cell.vocabulary.module

export const DESCRIPTION_NAMESPACE = 'Cell' as const

export const RUN_MEMBER = 'run' as const

export const GEN_MEMBER = 'gen' as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const SEQUENCED_CELL_RUN_NAME = 'a Cell.run whose success binding feeds a second Cell.run' as const

export const SEQUENCED_CELL_RUN_EXPECTED =
  'one Effect.gen body that runs each Cell once, with independent runs fanned out and response-to-command composition carried by Cell.andThen' as const

export const SEQUENCED_CELL_RUN_ACTUAL =
  'the success binding of one Cell.run is the input of a second Cell.run in the same Effect.gen body — hand-bound sequencing Cell.andThen already composes' as const

export const SEQUENCED_CELL_RUN_FIX =
  'compose the two cells with Cell.andThen(first, second) and run the spine once; when the runs are independent, keep the fan-out and stop feeding one binding into the other; when nothing consumes the second run, delete it' as const

export const SEQUENCED_CELL_RUN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report a Cell.run inside one Effect.gen body whose input carries the success binding of an earlier Cell.run in the same body. The Cell binding and the composer name are read off Cell.vocabulary; independent fan-out, a single run, and Cell.andThen composition stay silent.',
  },
  schema: [Options],
  messages: {
    sequencedCellRun: SEQUENCED_CELL_RUN_MESSAGE,
  },
} as const
