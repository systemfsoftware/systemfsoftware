import { MESSAGE } from './path.config.js'

export const TEST_FILE_IN_SRC_EXPECTED =
  'only *.property.test.ts, or the generated schema-laws.test.ts entry point, under src/' as const
export const TEST_FILE_IN_SRC_ACTUAL =
  'a test file under src/ that is neither the schema-laws entry point nor a property test' as const
export const TEST_FILE_IN_SRC_FIX =
  'name it <cell>.property.test.ts beside a workflow or policy; otherwise move it to tests/ as *.integration.test.ts or *.feature.test.ts, or inline it as an `if (import.meta.vitest)` block exercising a private binding' as const

export const SCHEMA_TEST_EXPECTED =
  'no authored test under this name — the generated schema-laws.test.ts carries the ruleOfSchemas pair for every exported schema' as const
export const SCHEMA_TEST_ACTUAL = 'an authored *.schema.test.ts restating generated coverage' as const
export const SCHEMA_TEST_FIX =
  'delete it. The generated laws already state round-trip identity and encode stability. What they cannot state is rejection — every input they draw comes from the arbitrary the schema itself supplies — so a refusal belongs in <name>.schema.property.test.ts, never here' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under src/, the only sanctioned test files are *.property.test.ts and the generated schema-laws.test.ts entry point. *.schema.test.ts is forbidden outright; every other test form must move out of src/ or become an in-source vitest block testing private code.',
  },
  schema: [],
  messages: {
    testFileInSrc: MESSAGE,
    schemaTestInSrc: MESSAGE,
  },
} as const
