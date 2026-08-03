import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const FORBIDDEN_CELL_SUFFIXES = [
  '.workflow',
  '.state',
  '.handler',
  '.policy',
  '.store',
  '.acl',
  '.observer',
  '.adapter',
  '.middleware',
] as const

export const DOMAIN_CELL_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban imports of sibling domain cells (workflow, state, handler, policy, store, acl, observer, adapter, middleware) in *.adapter.ts files. The adapter imports only the port (its executor), its domain error type (schema), the foreign wire shape, its one foreign package, and domain-blind kernel utilities.',
  },
  schema: [Options],
  messages: {
    domainCellImport: DOMAIN_CELL_IMPORT_MESSAGE,
  },
} as const
