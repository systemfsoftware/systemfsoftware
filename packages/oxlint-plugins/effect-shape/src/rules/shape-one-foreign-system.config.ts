import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MULTIPLE_FOREIGN_SYSTEMS_EXPECTED =
  'constructs from exactly one foreign package — one foreign system per *.shape.ts file' as const
export const MULTIPLE_FOREIGN_SYSTEMS_FIX = 'split each foreign system into its own *.shape.ts file' as const

export const MULTIPLE_FOREIGN_SYSTEMS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Require exactly one foreign package per *.shape.ts file: a shape declares one foreign system's model, so every non-relative, non-node: import must share a single package root.",
  },
  schema: [Options],
  messages: {
    multipleForeignSystems: MULTIPLE_FOREIGN_SYSTEMS_MESSAGE,
  },
} as const
