export const MESSAGE =
  '*.workflow.ts exports {{count}} functions. Expected exactly one function export — the workflow itself. Schema classes and types are fine; make steps and helpers private.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.workflow.ts must export exactly one function — the workflow itself. Schema classes and types are public and may be exported. Steps, helpers, and constants are private.',
  },
  schema: [],
  messages: {
    tooManyFunctionExports: MESSAGE,
  },
} as const
