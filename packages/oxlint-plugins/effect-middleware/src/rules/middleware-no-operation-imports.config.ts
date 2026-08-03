import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const OPERATION_SYMBOL_SUFFIXES = [
  'Executor',
  'Workflow',
  'Store',
] as const

export const OPERATION_SYMBOL_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban import bindings named *Executor/*Workflow/*Store — in *.middleware.ts files. A middleware is the transport front-half: it decodes and attaches facts at the edge and must never reach into the operation (architect-middleware MW2).',
  },
  schema: [Options],
  messages: {
    operationSymbolImport: OPERATION_SYMBOL_IMPORT_MESSAGE,
  },
} as const
