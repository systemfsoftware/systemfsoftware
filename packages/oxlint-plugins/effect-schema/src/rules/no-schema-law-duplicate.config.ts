export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const SCHEMA_PROPERTY_SUFFIX = '.schema.property.test.ts' as const

export const GENERATED_LAW_NAMES: ReadonlySet<string> = new Set([
  'ruleOfSchemas',
  'equivalence',
  'encodedSchema',
])

export const LAW_DUPLICATE_EXPECTED = 'only refusals in a *.schema.property.test.ts — what the schema rejects' as const

export const LAW_DUPLICATE_ACTUAL =
  'a restatement of the generated round-trip laws, which already cover every exported schema' as const

export const LAW_DUPLICATE_FIX =
  'delete it. `ruleOfSchemas`, `Schema.equivalence` and `Schema.encodedSchema` are the generated laws\u2019 own machinery, so asserting with them here can only repeat coverage that exists. This file earns its place by stating a refusal, with a generator derived from the domain contract rather than from the refinement literal' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.schema.property.test.ts may state only refusals. The generated `ruleOfSchemas` pair draws every input from the schema\u2019s own arbitrary, so each one already satisfies the refinement under test and no generated law can reach rejection — that gap is the sole reason this file is allowed to exist. Restating round-trip identity, equivalence, or encoded-schema stability here duplicates generated coverage and drifts from it.',
  },
  schema: [],
  messages: {
    lawDuplicate: MESSAGE,
  },
} as const
