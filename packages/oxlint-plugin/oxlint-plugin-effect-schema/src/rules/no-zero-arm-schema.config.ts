export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ZERO_ARM_EXPECTED =
  'a schema with at least one arm, so the schema accepts the values its properties generate from' as const

export const ZERO_ARM_ACTUAL =
  'a schema with no arms, which accepts nothing, so properties built on it are vacuously satisfied' as const

export const ZERO_ARM_FIX =
  'add at least one member to the union or literals so the schema accepts the values it claims' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'A schema with no arms accepts nothing, so properties built on it are vacuously satisfied: unions carry a member, literals carry a literal, never never appears as a member value.',
  },
  schema: [],
  messages: {
    zeroArmSchema: MESSAGE,
  },
} as const
