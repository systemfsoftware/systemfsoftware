import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SHELL_CELL_SUFFIXES = [
  '.store',
  '.adapter',
  '.executor',
  '.handler',
  '.middleware',
  '.policy',
  '.state',
  '.shape',
  '.observer',
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
      'Ban imports of shell cells and Node runtime modules in *.workflow.ts files. The pure decision core may only depend on sibling schemas and shared domain values.',
  },
  schema: [Options],
  messages: {
    shellCellImport: SHELL_CELL_IMPORT_MESSAGE,
    runtimeModuleImport: RUNTIME_MODULE_IMPORT_MESSAGE,
  },
} as const
