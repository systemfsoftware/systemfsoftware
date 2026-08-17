export const SCHEMA_FILE_SUFFIX = '.schema.ts' as const

/** A workflow file: one stem segment with no periods, then `.workflow.ts`. */
export const WORKFLOW_FILE_BASENAME = /^[^.]+\.workflow\.ts$/

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'schema declarations only in *.schema.ts (any stem, several per file) or in the owning <stem>.workflow.ts' as const
export const ACTUAL =
  'a schema declared in a file that is neither *.schema.ts nor a single-segment <stem>.workflow.ts' as const
export const FIX =
  'move it to <stem>.schema.ts or into the *.workflow.ts that owns it and import it; a schema only a test uses belongs in tests/__fixtures__/<stem>.schema.ts' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Effect Schema declarations live only in *.schema.ts files (any stem, several per file) or in the <stem>.workflow.ts file that owns them.',
  },
  schema: [],
  messages: {
    schemaOutsideSchemaFile: MESSAGE,
  },
} as const
