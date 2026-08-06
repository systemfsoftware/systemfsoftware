import { MESSAGE, PROPERTY_CELLS } from './path.config.js'

const SANCTIONED_CELLS = PROPERTY_CELLS.join(', ')

export const TEST_FILE_IN_SRC_EXPECTED =
  'src/**/__tests__/<cell>.property.test.ts on a sanctioned cell suffix, or the generated schema-laws.test.ts entry point' as const
export const TEST_FILE_IN_SRC_ACTUAL =
  'a test file under src/ that is neither the schema-laws entry point nor a property test inside a __tests__ directory' as const
export const TEST_FILE_IN_SRC_FIX =
  `pick the arm matching what this file exercises. A sanctioned cell (${SANCTIONED_CELLS}) -> move to src/<dir>/__tests__/<cell>.property.test.ts, e.g. src/order/__tests__/confirm-order.workflow.property.test.ts. The package public surface -> move outside src/ to __tests__/<name>.integration.test.ts. A private, non-exported binding -> delete this file and inline its assertions as an \`if (import.meta.vitest)\` block in the module declaring that binding. No arm matches -> delete this file`

export const PROPERTY_TEST_LOCATION_EXPECTED =
  'src/**/__tests__/<name> — a property test one directory down from the cell it covers, never beside it' as const
export const PROPERTY_TEST_LOCATION_ACTUAL =
  'a property test beside its source under src/, outside any __tests__ directory' as const
export const PROPERTY_TEST_LOCATION_FIX =
  'move the file down one directory into __tests__: src/<dir>/<name> -> src/<dir>/__tests__/<name>. The suffix is already sanctioned; only the directory is wrong. Relative imports shift one level: ./<cell>.js -> ../<cell>.js' as const

export const SCHEMA_TEST_EXPECTED =
  'no authored test under this name — the generated schema-laws.test.ts carries the ruleOfSchemas pair for every exported schema' as const
export const SCHEMA_TEST_ACTUAL = 'an authored *.schema.test.ts restating generated coverage' as const
export const SCHEMA_TEST_FIX =
  'delete it. The generated laws already state round-trip identity and encode stability. What they cannot state is rejection — every input they draw comes from the arbitrary the schema itself supplies — so a refusal belongs in <name>.schema.property.test.ts, never here' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under src/, the only sanctioned test files are a sanctioned-cell *.property.test.ts inside a __tests__ directory and the generated schema-laws.test.ts entry point. A property test beside its source is reported for location alone. *.schema.test.ts is forbidden outright; every other test form must move outside src/ as an integration test or become an in-source vitest block testing private code.',
  },
  schema: [],
  messages: {
    testFileInSrc: MESSAGE,
    schemaTestInSrc: MESSAGE,
    propertyTestOutsideTestsDir: MESSAGE,
  },
} as const
