import { JSONSchema, Schema as S } from 'effect'

import { DEFAULT_ENTRY_PATTERN, ENTRY_PATTERN_OPTION } from './shared-entry-pattern.config.js'

export { DEFAULT_ENTRY_PATTERN }

export const Options = S.Struct({
  entryPattern: ENTRY_PATTERN_OPTION,
})

export const ENTRY_MIX_EXPECTED =
  'a declared entry contains only surface content - enumerated re-exports, chunk namespace objects, binders, and lazy Layer values - or only its own definitions, never both' as const
export const ENTRY_MIX_ACTUAL = 'this entry mixes surface re-exports with a behaviour-bearing definition' as const
export const ENTRY_MIX_FIX =
  'move the definition into the cell that owns it (kernel, executor, adapter, store, ...) and leave the entry enumerating the surface; a name whose behaviour lives in a cell belongs behind that cell, not behind the entry' as const

export const ENTRY_MIX_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NON_ENTRY_REEXPORT_EXPECTED = 'a non-entry module re-exports only names it declares itself' as const
export const NON_ENTRY_REEXPORT_ACTUAL =
  're-exporting a name whose home is another module gives that name a second home, and since the cell import table decides on the specifier, the second home launders an edge the table would otherwise refuse' as const
export const NON_ENTRY_REEXPORT_FIX =
  'declare the name in this module, or drop the re-export and import the name where it is consumed; a re-export must never give a foreign name a second, unpoliced home' as const

export const NON_ENTRY_REEXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

// Clause B exempts neither type-only re-exports nor `.harness.ts`, and both are
// load-bearing: `cell-import-boundary` gates only its `forbidValue` list on a
// runtime binding, so `export type { T } from` is a real edge, and the harness
// has its own import-table row. Exempting either laundries an edge the table
// refuses.

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A declared entry contains only surface content or only its own definitions, never both; a non-entry module re-exports only names it declares itself. Surface content is enumerated re-exports, chunk namespace objects (every property value an identifier bound by an import), binders, and lazy Layer values built from imported bindings; anything that invokes an effect at module scope is a hidden composition root and is a definition, not surface. Clause B reaches every non-entry module, including `.harness.ts` cells, and does not exempt type-only re-exports: the cell import table polices both as edges, so a second home launders an edge the table would refuse.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    entrySurfaceAndUnit: ENTRY_MIX_MESSAGE,
    nonEntryForeignReexport: NON_ENTRY_REEXPORT_MESSAGE,
  },
} as const
