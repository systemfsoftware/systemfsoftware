export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const VIOLATION_NAME = 'a hand-written duplicate of the generated schema laws' as const

export const EXPECTED =
  'in-source it.prop cases state only what the generated law suite cannot: refusals and domain decision laws over schema-derived inputs — never round-trip identity, encode stability, or plain decode acceptance of a schema' as const

export const ACTUAL =
  'the property draws from a schema and its predicate only exercises that codec, so the generated schema-laws.test.ts (ruleOfSchemas, injected by @systemfsoftware/effect-schema-vite) already proves it — the block is a second copy of a generated law' as const

export const FIX =
  'delete the prop. What generation cannot state is rejection and domain decisions: a refusal (decode fails) or a decision law belongs in-source with its input derived through S.toArbitrary(schema)(fc) chains' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an import.meta.vitest in-source block, an it.prop whose arbitraries are schema-derived and whose predicate only exercises codec vocabulary (encode/decode/Exit-acceptance/equivalence) duplicates the generated ruleOfSchemas pair for that schema. The generated suite already proves decode-encode identity and encode stability for every exported schema; a hand-written copy is a second copy of a generated law.',
  },
  schema: [],
  messages: {
    generatedLawDuplicate: MESSAGE,
  },
} as const
