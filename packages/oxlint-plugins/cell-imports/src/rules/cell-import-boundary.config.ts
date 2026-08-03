import { Schema as S } from 'effect'

export const Options = S.Struct({})
export type Options = S.Schema.Type<typeof Options>

export const BOUNDARY_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CELL_EXPECTED = 'a cell imports only what the cell import table permits for its suffix' as const
export const CELL_FIX =
  'move the dependency behind a port the importing cell may reach, or relocate the code to a cell that may reach it' as const

export const VALUE_EXPECTED = 'at most a type-only reference to this cell' as const
export const VALUE_FIX = 'use `import type` so no runtime edge is created' as const

export const RUNTIME_EXPECTED = 'no direct runtime module; I/O belongs in the shell' as const
export const RUNTIME_FIX = 'take the capability as a dependency instead of importing the builtin' as const

export const OBSERVER_EXPECTED = 'observer cells are reachable only from observers, tests and tooling' as const
export const OBSERVER_FIX = 'delete the import, or move the caller into the observer frame' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'Every cell-to-cell import edge in the taxonomy, decided by one table instead of one rule per cell.',
  },
  schema: [Options],
  messages: {
    forbiddenCellImport: BOUNDARY_MESSAGE,
    forbiddenValueImport: BOUNDARY_MESSAGE,
    forbiddenRuntimeImport: BOUNDARY_MESSAGE,
    forbiddenObserverImport: BOUNDARY_MESSAGE,
  },
} as const
