export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a *.cell.ts file to export exactly one value — the cell it declares — with its type vocabulary (interfaces, type aliases, type-only specifiers) free' as const

export const FIX =
  "keep the cell as the file's one value export; move every other exported value — a Schema.Struct declaration included — to the *.schema.ts file that declares its type, or keep it private to this file" as const

export const VALUE_EXPORT_ACTUAL_OF = (name: string): string =>
  `a second value export \`${name}\` beside the *.cell.ts file's cell` as const

export const DEFAULT_EXPORT_ACTUAL = "a default export beside the *.cell.ts file's cell" as const

export const REEXPORT_EXPECTED =
  "a *.cell.ts file to be a declaration locus that exports its own cell, never another module's surface" as const

export const REEXPORT_ACTUAL_TEMPLATE =
  'a re-export that routes the surface of {{source}} through this cell file' as const

export const REEXPORT_FIX =
  'delete the re-export and import from the owning module where the names are used; a re-export hides whether a second value leaves the cell file' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.cell.ts file exports exactly one value — its cell. Every later value export (a Schema.Struct declaration included) and every re-export is refused; exported interfaces, type aliases, type-only specifiers and ambient namespaces are free, and a bare cell.ts carries no role and is not judged.',
  },
  schema: [],
  messages: {
    cellValueExport: MESSAGE,
    cellReexport: MESSAGE,
  },
} as const
