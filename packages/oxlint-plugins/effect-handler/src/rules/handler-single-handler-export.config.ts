import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const TOO_MANY_HANDLER_EXPORTS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DISALLOWED_HANDLER_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.handler.ts must export exactly one handler function — the transport terminus for one route. Types, schemas, Symbol.for TypeIds, and a router/route-table that registers the handler are exempt and may also be exported.',
  },
  schema: [Options],
  messages: {
    tooManyFunctionExports: TOO_MANY_HANDLER_EXPORTS_MESSAGE,
    disallowedExport: DISALLOWED_HANDLER_EXPORT_MESSAGE,
  },
} as const
