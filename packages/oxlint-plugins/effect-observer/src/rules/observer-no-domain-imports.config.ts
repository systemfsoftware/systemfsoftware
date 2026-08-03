import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The mechanical half of OB2: any import whose path ends in a domain cell
 * suffix is a domain import. `.observer` and `.kernel` are deliberately NOT in
 * the list — observer machinery may import sibling observer modules and
 * vocabulary-free kernel helpers, and may reason in Effect vocabulary.
 */
export const DOMAIN_CELL_SOURCE =
  /\.(?:schema|workflow|executor|store|acl|adapter|handler|middleware|policy|state|shape)(?:\.(?:[cm]?[tj]s))?$/u

export const DOMAIN_IMPORT_EXPECTED =
  'imports of operational modules only — effect/*, sibling *.observer modules, and vocabulary-free *.kernel helpers' as const
export const DOMAIN_IMPORT_ACTUAL =
  'an import of a domain cell (schema, workflow, executor, store, acl, adapter, handler, middleware, policy, state, or shape)' as const
export const DOMAIN_IMPORT_FIX =
  'reason in operational vocabulary — pass domain values in as fixture data, or extract the shared logic into a *.kernel.ts module' as const

export const DOMAIN_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban domain-cell imports in *.observer.ts files. Observer machinery reasons in operational vocabulary (Step, Effect, Span, Layer, Fixture); a domain import silently encodes domain assumptions the domain never declared, so tests pass against the harness rather than the system.',
  },
  schema: [Options],
  messages: {
    domainCellImport: DOMAIN_IMPORT_MESSAGE,
  },
} as const
