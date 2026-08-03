import { Schema as S } from 'effect'

export const Options = S.Struct({})

/** The mechanical half of SH2: any DMMF cell suffix is a domain import. */
export const DOMAIN_CELL_SOURCE =
  /\.(?:schema|workflow|executor|store|acl|adapter|handler|middleware|policy|state|observer|kernel)(?:\.(?:[cm]?[tj]s))?$/u

export const DOMAIN_IMPORT_EXPECTED = "only the foreign system's own vocabulary — never a domain declaration" as const
export const DOMAIN_IMPORT_ACTUAL =
  'an import of a domain cell (schema, workflow, executor, store, acl, adapter, handler, middleware, policy, state, observer, or kernel)' as const
export const DOMAIN_IMPORT_FIX =
  'let the *.acl.ts cross the boundary — the shape declares only the foreign model' as const

export const DOMAIN_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Ban domain imports in *.shape.ts files: a shape declares a foreign system's model and must import nothing domain — no sibling *.schema.ts declarations and no other DMMF cell.",
  },
  schema: [Options],
  messages: {
    domainImport: DOMAIN_IMPORT_MESSAGE,
  },
} as const
