import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const SIGNATURE_EXPECTED =
  'exactly one non-schema value export from a <stem>.workflow.ts file — the decision — with schema declarations and type-only surface allowed beside it' as const

export const MISSING_ACTUAL = 'a workflow file with no non-schema value export' as const

export const MISSING_FIX =
  'export the decision this file owns. If the file has no decision, it is not a workflow file — delete it or stop naming it *.workflow.ts' as const

export const EXTRA_ACTUAL = 'a second non-schema value export from this workflow file' as const

export const EXTRA_FIX =
  'delete the extra export, or move it into a sibling module that is not a *.workflow.ts and import it from there; do not re-export it from this file' as const

export const REEXPORT_EXPECTED =
  'a <stem>.workflow.ts file to export what it declares, never a binding that arrived from another module' as const

export const REEXPORT_ACTUAL_TEMPLATE =
  'a re-export that routes the surface of {{source}} through this file instead of declaring its own' as const

export const REEXPORT_FIX =
  'delete the re-export and import from the owning module where the names are used; re-exporting moves the decision off this file and breaks the one-export gate' as const

/** Schema factory / combinator members whose call or class-extend is a schema declaration, not the one value export. */
export const SCHEMA_DECLARATION_MEMBERS: Record<string, true> = {
  Array: true,
  Class: true,
  Literal: true,
  Literals: true,
  NonEmptyArray: true,
  NullOr: true,
  optional: true,
  optionalWith: true,
  Record: true,
  Struct: true,
  StructWithRest: true,
  suspend: true,
  TaggedClass: true,
  TaggedError: true,
  Tuple: true,
  UndefinedOr: true,
  Union: true,
  Boolean: true,
  Finite: true,
  Int: true,
  Number: true,
  String: true,
  Unknown: true,
  Void: true,
}

/** Schema members that consume a schema and return a non-schema value. */
export const SCHEMA_USE_MEMBERS: Record<string, true> = {
  decode: true,
  decodeEffect: true,
  decodeExit: true,
  decodeOption: true,
  decodePromise: true,
  decodeResult: true,
  decodeSync: true,
  decodeUnknownEffect: true,
  decodeUnknownExit: true,
  decodeUnknownOption: true,
  decodeUnknownPromise: true,
  decodeUnknownResult: true,
  decodeUnknownSync: true,
  encode: true,
  encodeEffect: true,
  encodeExit: true,
  encodeOption: true,
  encodePromise: true,
  encodeResult: true,
  encodeSync: true,
  encodeUnknownEffect: true,
  encodeUnknownExit: true,
  encodeUnknownOption: true,
  encodeUnknownPromise: true,
  encodeUnknownResult: true,
  encodeUnknownSync: true,
  toArbitrary: true,
  toJsonSchemaDocument: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A single-segment *.workflow.ts file publishes exactly one non-schema value export. Schema declarations and type-only surface do not count. Every re-export form is forbidden, including export { x } of an imported binding.',
  },
  schema: [Options],
  messages: {
    extraValueExport: MESSAGE,
    missingValueExport: MESSAGE,
    reexportFromWorkflowFile: MESSAGE,
  },
} as const
