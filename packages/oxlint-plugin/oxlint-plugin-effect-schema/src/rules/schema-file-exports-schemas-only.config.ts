/** Any stem, then `.schema.ts` — the schema-file pattern `schema-declaration-location` keys on. */
export const SCHEMA_FILE_SUFFIX = '.schema.ts' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CODEC_EXPORT_EXPECTED =
  'a *.schema.ts file to export only schema declarations — the file declares the schema, and the caller applies the codec at the point of use' as const

export const CODEC_EXPORT_ACTUAL =
  'an exported const that consumes a schema through a use combinator (encode / decode / Arbitrary.schema / JSON-schema document) instead of declaring one' as const

export const CODEC_EXPORT_FIX =
  'delete the const and build the codec where the boundary is crossed: import this schema from here and apply S.encodeSync / S.decodeSync / S.decodeUnknownSync / Arbitrary.schema in the consuming module. The schema file is the declaration; the caller is the use.' as const

export const NON_SCHEMA_EXPORT_EXPECTED =
  'a *.schema.ts file to export only schema declarations (a module-scope const initializing a Schema.* combinator, or a class extending a Schema factory), the type vocabulary those schemas are built from (type aliases, interfaces, enums, type-only namespaces), the type-identity symbols that name a type at runtime (a const initialized to Symbol.for(<literal>) or Symbol(<literal>)), operations whose declared parameter or return type names one of those same-file types, and values whose declarator annotation names one of them' as const

export const NON_SCHEMA_EXPORT_ACTUAL =
  'an exported value that names no same-file type — not a schema declaration, and not an operation over one or a value of one' as const

export const NON_SCHEMA_EXPORT_FIX =
  'delete it, or make it an operation on a type this file declares: add the schema declaration and its type vocabulary, then export the function that takes or returns that type. A function whose inputs and output are only bare primitives has no type home here — brand the value (declare its type as a Schema.brand) and operate on that type in this file, or keep the function private to its one consumer.' as const

export const MISSING_ANNOTATION_EXPORT_EXPECTED =
  'an exported function in a *.schema.ts file to declare its parameter and return types, so the signature names the same-file type the operation is homed by' as const

export const MISSING_ANNOTATION_EXPORT_ACTUAL =
  'an exported function whose parameters and return type carry no explicit type annotation, so nothing in the file names the type it operates on' as const

export const MISSING_ANNOTATION_EXPORT_FIX =
  'write the annotations: `export const positionAt = (starts: LineStarts, offset: Offset): Position => ...` — each type must be one this file declares (a schema declaration, type alias, interface or enum), so the signature names the same-file type the operation is homed by' as const

export const EFFECT_CARRIER_EXPORT_EXPECTED =
  'a *.schema.ts file to export operations over data — a function returning an Effect, Stream or Layer is a live computation, whose home is the handle, service or workflow that owns that machine' as const

export const EFFECT_CARRIER_EXPORT_ACTUAL =
  'an exported function whose return type annotation names an Effect, Stream or Layer carrier' as const

export const EFFECT_CARRIER_EXPORT_FIX =
  'move it to the module that owns the machine: a `*.handle.ts`, `*.service.ts` or `*.workflow.ts` may return `Effect.Effect<A, E, R>`; a schema file exports the data type and the operations that return plain data over it' as const

export const REEXPORT_EXPECTED =
  'a *.schema.ts file to be a declaration locus — it exports what it declares, and nothing else' as const

export const REEXPORT_ACTUAL_TEMPLATE =
  'a re-export that routes the surface of {{source}} through this file instead of declaring its own' as const

export const REEXPORT_FIX =
  "delete the re-export and import from the owning module where the names are used; re-exporting hides this file's true surface and lets foreign values leak into the exports the schema-law suite scans" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.schema.ts file may export only the schema declarations it holds (a module-scope class extending a Schema factory, or a module-scope const initialized to a Schema.* combinator), the type vocabulary those schemas are built from (type aliases, interfaces, enums, type-only namespaces), the type-identity symbols that name a type at runtime (a const initialized to Symbol.for(<literal>) or Symbol(<literal>)), and operations homed by a same-file type: a function, or a const whose declarator type annotation is a function type or a type literal of call signatures (the `dual` shape pipeable operations wear), whose declared parameter or return type annotation names one of those same-file types, and whose return type names no Effect, Stream or Layer carrier. A const whose declarator annotation names one of those same-file types is data of that type and is admitted the same way, while an annotation rooted at a foreign type or naming a carrier still refuses. A same-file read follows the annotation through a union or intersection member, a type predicate target, a type parameter extends constraint, and a readonly array element; a union or intersection member that is an Effect, Stream or Layer carrier still refuses. An operation that declares no annotation — a function with none, or a call-initialized const with none — is refused — annotations are how the operation names the type it serves. A function returning an Effect carrier is refused — that live computation belongs to a handle, service or workflow. A function over bare primitives only is refused with a fix that names branding the value. An exported const that applies a schema through a use combinator (S.encodeSync, S.decodeSync, S.decodeUnknownSync, Arbitrary.schema, ...) is a codec built in the wrong home — the schema file declares the schema and the caller applies it — and every re-export form is banned, because the schema file is a declaration locus, not a re-routing hub.',
  },
  schema: [],
  messages: {
    codecExport: MESSAGE,
    nonSchemaExport: MESSAGE,
    missingAnnotationExport: MESSAGE,
    effectCarrierExport: MESSAGE,
    reexportFromSchemaFile: MESSAGE,
  },
} as const
