import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MAIN_MODULE_SOURCE = /(?:^|\/)main(?:\.[cm]?[jt]sx?)?$/u

export const ENTRYPOINT_IMPORT_EXPECTED =
  'the entrypoint imported by nothing - the process interprets it, no module consumes it' as const
export const ENTRYPOINT_IMPORT_ACTUAL = 'an import of main.ts' as const
export const ENTRYPOINT_IMPORT_FIX =
  'import the cell that owns the binding instead; if main.ts is the only place it exists, it was never an entrypoint - move the behavior into an executor, adapter, or layer and leave main.ts holding only the interpretation edge' as const

export const ENTRYPOINT_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban every import of a main module. An entrypoint is a process edge, not a module surface; an importer proves main.ts is carrying behavior that belongs in a cell, and turns the entrypoint into a second, unreachable interpretation site.',
  },
  schema: [Options],
  messages: {
    entrypointImport: ENTRYPOINT_IMPORT_MESSAGE,
  },
} as const
