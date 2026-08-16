import { Effect, Schema as S } from 'effect'

export const Options = S.Struct({
  whitelist: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
})

export const TagVariants: ReadonlySet<string> = new Set([
  'TaggedError',
  'Error',
  'Service',
  'Class',
  'TaggedClass',
])
export const ImportVariants: ReadonlySet<string> = new Set(['S', 'Schema', 'Data', 'Effect'])
export const ContextVariants: ReadonlySet<string> = new Set(['Tag', 'Reference'])

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban class declarations and class expressions. TaggedError, Service, Class, TaggedClass from effect/Data are the sanctioned replacements.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    noClasses: "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.",
  },
} as const
