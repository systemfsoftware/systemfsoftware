import { JSONSchema, Schema as S } from 'effect'

// Mirrors the `ENTRYPOINT_FILE` regex convention of `entrypoint-no-exports.config.ts`
// with the barrel filename the doctrine names (KTD-5): a declared entry is `mod.ts`.
// Overridable per package through the `entryPattern` option (R10) — a package whose
// barrel is `index.ts` passes `{ entryPattern: '(?:^|[\\\\/])index\\.ts$' }` rather
// than going unjudged.
export const DEFAULT_ENTRY_PATTERN = '(?:^|[\\\\/])mod\\.ts$' as const

export const Options = S.Struct({
  entryPattern: S.optionalWith(
    S.String,
    { default: () => DEFAULT_ENTRY_PATTERN },
  ),
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

// The two Q3 decisions this unit must answer before its fixtures were written.
//
// Q3a - Does Clause B exempt a type-only re-export (`export type { T } from './t.js'`)?
// NO. The cell import table polices type-only re-exports as real edges:
// `cell-import-boundary` inspects every `ExportNamedDeclaration` with a source,
// passing `exportKind !== 'type'` only as the VALUE-binding flag, so the forbid
// and forbidRuntime checks fire for `export type { T } from` exactly as they do
// for a value re-export; only the narrower forbidValue list is gated on a runtime
// binding. An integration test may not import the `.kernel` cell even type-only,
// so exempting type-only re-exports here would open a laundering hole for
// precisely the edges the table refuses. A type-only re-export is still a
// re-export of a foreign name, and R8 draws no runtime/type distinction.
//
// Q3b - Does Clause B reach a `.harness.ts` cell?
// YES. R8 exempts no cell, and the harness is a real cell: it has its own row in
// the import table and is a specifier tests may legally import, so a foreign
// re-export from a harness launders a test->cell edge the table refuses (the
// `.integration.test.ts` row forbids `.kernel`/`.workflow`/`.schema`/`.acl`,
// including type imports). The measured expectation in the plan tracks the
// gherkin violation through the U8 rename of feature.kernel.ts to
// feature.harness.ts, which only makes sense if the harness stays in radius.
// Neither decision is resolved by an ad-hoc exemption at a call site: the rule
// applies uniformly, and fallout is the orchestrator's to fix.

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
