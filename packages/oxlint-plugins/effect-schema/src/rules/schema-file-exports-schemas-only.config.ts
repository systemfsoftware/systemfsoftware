/** Any stem, then `.schema.ts` — the schema-file pattern `schema-declaration-location` keys on. */
export const SCHEMA_FILE_SUFFIX = '.schema.ts' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CODEC_EXPORT_EXPECTED =
  'a *.schema.ts file to export only schema declarations — the file declares the schema, and the caller applies the codec at the point of use' as const

export const CODEC_EXPORT_ACTUAL =
  'an exported const that consumes a schema through a use combinator (encode / decode / arbitrary / JSON-schema document) instead of declaring one' as const

export const CODEC_EXPORT_FIX =
  'delete the const and build the codec where the boundary is crossed: import this schema from here and apply S.encodeSync / S.decodeSync / S.decodeUnknownSync / S.toArbitrary in the consuming module. The schema file is the declaration; the caller is the use.' as const

export const NON_SCHEMA_EXPORT_EXPECTED =
  'a *.schema.ts file to export only schema declarations (a module-scope const initializing a Schema.* combinator, or a class extending a Schema factory) and the type vocabulary those schemas are built from (type aliases, enums)' as const

export const NON_SCHEMA_EXPORT_ACTUAL = 'an exported value that is not a schema declaration' as const

export const NON_SCHEMA_EXPORT_FIX =
  'delete it, or move it into the module that owns it; a schema file declares schemas, it does not host functions, constants, plain classes, or other values' as const

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
      'A *.schema.ts file may export nothing but schemas: a module-scope class extending a Schema factory, or a module-scope const initialized to a Schema.* combinator, plus the type vocabulary (type aliases, enums) those schemas are built from. An exported const that applies a schema through a use combinator (S.encodeSync, S.decodeSync, S.decodeUnknownSync, S.toArbitrary, ...) is a codec built in the wrong home — the schema file declares the schema and the caller applies it — and every re-export form is banned, because the schema file is a declaration locus, not a re-routing hub. Exports that are neither schemas nor their vocabulary are banned outright.',
  },
  schema: [],
  messages: {
    codecExport: MESSAGE,
    nonSchemaExport: MESSAGE,
    reexportFromSchemaFile: MESSAGE,
  },
} as const
