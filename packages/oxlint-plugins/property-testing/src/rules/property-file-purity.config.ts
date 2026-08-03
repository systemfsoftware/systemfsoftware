export const PROPERTY_TEST_SUFFIX = '.property.test.ts' as const
export const SNAPSHOT_TEST_SUFFIX = '.snapshot.test.ts' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property tests live ONLY in *.property.test.ts files, and those files contain ONLY property tests. In a property file: no plain it()/test()/it.effect(), no raw fc.assert/fc.check/fc.property/fc.asyncProperty. In any other test file: no FastCheck import and no it.prop/it.effect.prop — move the property to a *.property.test.ts file. A *.snapshot.test.ts is exempt from the FastCheck-import ban because deterministic seeded sampling is the entire point of the snapshot kind.',
  },
  schema: [],
  messages: {
    plainIt: MESSAGE,
    plainEffectIt: MESSAGE,
    rawFastCheck: MESSAGE,
    fastCheckImport: MESSAGE,
    propCall: MESSAGE,
  },
} as const
