export const FAST_CHECK_PACKAGE = 'fast-check' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "FastCheck must be imported from 'effect' as { FastCheck as fc } — never from the 'fast-check' package directly, and never under another alias. The stack's single import path keeps every lint rule and reader able to assume the `fc` namespace. Type-only imports (typeof FastCheck in annotation signatures) are exempt from the alias; the 'fast-check' package ban is absolute.",
  },
  schema: [],
  messages: {
    rawFastCheckImport: MESSAGE,
    fastCheckAlias: MESSAGE,
  },
} as const
