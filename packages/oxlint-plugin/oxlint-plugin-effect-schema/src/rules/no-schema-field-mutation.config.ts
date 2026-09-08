export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const FIELD_MUTATION_EXPECTED =
  'schema values that never escape their own invariant: fields are set once at construction and read after' as const

export const FIELD_MUTATION_ACTUAL =
  'an assignment through this in a schema class method: the value escapes its own invariant after construction' as const

export const FIELD_MUTATION_FIX =
  'build the updated value with a new construction instead of assigning through this, or move the mutation off the schema class' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Schema class fields are never reassigned through this in a method: a mutation in a method body lets the value escape the invariant its construction checked.',
  },
  schema: [],
  messages: {
    schemaFieldMutation: MESSAGE,
  },
} as const
