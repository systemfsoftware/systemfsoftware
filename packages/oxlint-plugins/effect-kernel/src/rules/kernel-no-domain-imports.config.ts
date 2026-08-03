import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DOMAIN_CELL_SUFFIXES = [
  '.schema',
  '.shape',
  '.state',
  '.workflow',
  '.executor',
  '.acl',
  '.handler',
  '.middleware',
  '.adapter',
  '.policy',
  '.observer',
  '.store',
] as const

export const NODE_BUILTIN_MODULES = [
  'fs',
  'fs/promises',
  'path',
  'crypto',
  'http',
  'https',
  'os',
  'child_process',
] as const

export const DOMAIN_CELL_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RUNTIME_MODULE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban imports of sibling domain cells and Node runtime modules in *.kernel.ts files (KE2). A kernel imports only other kernel modules and language/library primitives.',
  },
  schema: [Options],
  messages: {
    domainCellImport: DOMAIN_CELL_IMPORT_MESSAGE,
    runtimeModuleImport: RUNTIME_MODULE_IMPORT_MESSAGE,
  },
} as const
