export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const TIME_SOURCE_EXPECTED =
  'schema modules that read nothing from the world: every value a schema file builds is fixed at import' as const

export const TIME_SOURCE_ACTUAL =
  'a reach into the world from a schema module: a looks-pure definition reading a clock, a coin, or an id' as const

export const TIME_SOURCE_FIX =
  'move the read into the phase that needs it and pass the value in, or delete the read if no consumer distinguishes its outcomes' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Schema modules read nothing from the world: Date.now, Math.random, performance.now, and crypto.randomUUID have no home in a *.schema.ts file.',
  },
  schema: [],
  messages: {
    timeSourceInSchemaModule: MESSAGE,
  },
} as const
