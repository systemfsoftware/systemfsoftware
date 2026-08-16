import { Effect, Schema as S } from 'effect'

export const OptionsElement = S.Struct({
  allowUtilityTypes: S.Boolean.pipe(
    S.annotate({
      description: 'Allow utility types like Pick<T, K> and Omit<T, K>',
    }),
    S.withDecodingDefaultType(Effect.succeed(true)),
  ),
})

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban inline object type annotations (TSTypeLiteral) on destructured function parameters in favor of named types or utility generics',
  },
  schema: [
    S.toJsonSchemaDocument(OptionsElement).schema,
  ],
  messages: {
    noInlineDestructuredType:
      '{{name}} uses inline object type. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
