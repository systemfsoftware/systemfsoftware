import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ENTRYPOINT_FILE = /(?:^|[\\/])main\.ts$/u

export const NAMED_EXPORT = 'a named export from main.ts' as const
export const DEFAULT_EXPORT = 'a default export from main.ts' as const
export const STAR_EXPORT = 'a re-export from main.ts' as const

export const ENTRYPOINT_EXPORT_EXPECTED = 'an entrypoint with no public surface at all' as const
export const ENTRYPOINT_EXPORT_ACTUAL = 'an entrypoint exporting a binding for another module to import' as const
export const ENTRYPOINT_EXPORT_FIX =
  'nothing may import main.ts, so an export here is dead weight - move the binding to the cell that owns it (executor, adapter, layer) and leave main.ts holding only the interpretation edge' as const

export const ENTRYPOINT_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban every export from main.ts. An entrypoint is interpreted, never imported, so an exported binding proves the file is a library wearing the entrypoint name - the exemption that lets a junk drawer grow behind a sanctioned filename.',
  },
  schema: [Options],
  messages: {
    entrypointExport: ENTRYPOINT_EXPORT_MESSAGE,
  },
} as const
