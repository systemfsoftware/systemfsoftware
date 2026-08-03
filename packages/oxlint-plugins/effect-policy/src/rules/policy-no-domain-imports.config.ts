import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DOMAIN_CELL_SUFFIXES: ReadonlyArray<string> = [
  '.schema',
  '.shape',
  '.state',
  '.workflow',
  '.executor',
  '.store',
  '.acl',
  '.handler',
  '.middleware',
  '.adapter',
  '.service',
  '.shell',
  '.use-case',
  '.daemon',
  '.repository',
]

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban imports of domain cell modules in *.policy.ts files. A policy is domain-blind — it may not depend on a schema, shape, state, workflow, executor, store, ACL, handler, middleware, adapter, or legacy shell module.',
  },
  schema: [Options],
  messages: {
    domainCellImport: MESSAGE,
  },
} as const
