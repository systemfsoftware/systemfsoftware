import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ENTRYPOINT_FILE = /(?:^|[\\/])main\.ts$/u

export const TEST_FILE_PATTERN = /\.(test|spec|property\.test|tst)\.[cm]?tsx?$/u

export const CELL_MODULE = '@systemfsoftware/effect-cell-types'
export const CELL_NAME = 'Cell'
export const RUN_NAME = 'run'
export const CELL_RUN = 'Cell.run' as const

export const CELL_RUN_EXPECTED = 'the cell interpreted in the process entry module, main.ts, and nowhere else' as const
export const CELL_RUN_ACTUAL = 'a Cell.run outside the composition root' as const
export const CELL_RUN_FIX =
  'interpret the cell in main.ts and let this module hand back the cell it built - run placement is a decree, not an exemption: main.ts is the only composition root, and a cell run in a mid-tree module starts work the entrypoint never interrupts or finalizes' as const

export const CELL_RUN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban Cell.run outside main.ts. Run placement is a new decree, not an existing doctrine entry: the composition root is the process entry module and nothing else, so a cell interpreted in any other module is a second interpretation edge - invisible to the rules that gate main.ts, and the shape a layer-construction module grows into. The entry designation is the exact basename main.ts, the same key the entrypoint fleet binds its main.ts rules to; there is no compositionRoots option and no additional-root designation. Test files are exempt.',
  },
  schema: [Options],
  messages: {
    cellRunOutsideEntrypoint: CELL_RUN_MESSAGE,
  },
} as const
