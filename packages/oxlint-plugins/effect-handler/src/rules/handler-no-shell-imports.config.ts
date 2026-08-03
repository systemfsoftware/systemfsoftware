import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SHELL_CELL_SUFFIXES = [
  '.store',
  '.adapter',
  '.workflow',
  '.acl',
  '.state',
  '.middleware',
  '.policy',
  '.shape',
  '.observer',
  '.handler',
] as const

export const NODE_BUILTIN_MODULES = [
  'fs',
  'path',
  'crypto',
  'http',
  'https',
  'os',
  'child_process',
] as const

export const SHELL_CELL_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RUNTIME_MODULE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban imports of shell cells (store, adapter, workflow, acl, state, middleware, policy, shape, observer, handler) and Node runtime modules in *.handler.ts files. The transport terminus may only import the transport, schema codecs, domain-blind kernel utilities, and its single executor.',
  },
  schema: [Options],
  messages: {
    shellCellImport: SHELL_CELL_IMPORT_MESSAGE,
    runtimeModuleImport: RUNTIME_MODULE_IMPORT_MESSAGE,
  },
} as const
