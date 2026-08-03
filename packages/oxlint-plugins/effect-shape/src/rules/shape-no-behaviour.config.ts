import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BEHAVIOUR_EXPECTED =
  'inert declarations only — type aliases, interfaces, const declarations, foreign-owned enums' as const

export const FUNCTION_DECLARATION_ACTUAL = 'a function declaration' as const
export const FUNCTION_CONST_ACTUAL = 'a function-valued const' as const
export const METHOD_DEFINITION_ACTUAL = 'a class method body' as const
export const DEFAULT_FUNCTION_EXPORT_ACTUAL = 'a function as the default export' as const

export const BEHAVIOUR_FIX =
  'move the behaviour to the *.acl.ts, *.workflow.ts, or the owning shell cell — a shape declares, it never computes' as const

export const FUNCTION_DECLARATION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const FUNCTION_CONST_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const METHOD_DEFINITION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const DEFAULT_FUNCTION_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Keep *.shape.ts files inert: only type aliases, interfaces, const declarations, and foreign-owned enums — no function declarations, no function-valued consts, no class method bodies, and no function default exports.',
  },
  schema: [Options],
  messages: {
    functionDeclaration: FUNCTION_DECLARATION_MESSAGE,
    functionConst: FUNCTION_CONST_MESSAGE,
    methodDefinition: METHOD_DEFINITION_MESSAGE,
    defaultFunctionExport: DEFAULT_FUNCTION_EXPORT_MESSAGE,
  },
} as const
