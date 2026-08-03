import { JSONSchema, Schema as S } from 'effect'

export const OptionsElement = S.Struct({
  allowUtilityTypes: S.optionalWith(
    S.Boolean.pipe(S.annotations({
      description: 'Allow utility types like Pick<T, K> and Omit<T, K>',
    })),
    { default: () => true },
  ),
})

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Ban inline object type annotations (TSTypeLiteral) on destructured function parameters in favor of named types or utility generics',
  },
  schema: [
    JSONSchema.make(OptionsElement),
  ],
  messages: {
    noInlineDestructuredType:
      '{{name}} uses inline object type. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
