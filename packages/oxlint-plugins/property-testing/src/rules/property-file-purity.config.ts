import { Effect, Schema as S } from 'effect'

export const PROPERTY_TEST_SUFFIX = '.property.test.ts' as const

export const Options = S.Struct({
  /**
   * Admits property content (FastCheck imports, it.prop calls) in ANY test
   * file — for a consumer that has dismantled its suffix taxonomy and names
   * tests by domain (clanka/effect-torch shape). The in-property-file
   * discipline (no plain it(), no raw fc.assert) still applies to files
   * that DO carry the property suffix; a plain-named consumer's predicates
   * stay policed by the content rules (pbt-naming, no-nested-quantification).
   */
  admitPlainStems: S.Boolean.pipe(S.withDecodingDefaultType(Effect.succeed(false as const))),
})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Property tests live ONLY in *.property.test.ts files, and those files contain ONLY property tests. In a property file: no plain it()/test()/it.effect(), no raw fc.assert/fc.check/fc.property/fc.asyncProperty. In any other test file: no FastCheck import and no it.prop/it.effect.prop — move the property to a *.property.test.ts file. admitPlainStems (default false) additionally admits property content in any test file, for a consumer that has dismantled its suffix taxonomy.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    plainIt: MESSAGE,
    plainEffectIt: MESSAGE,
    rawFastCheck: MESSAGE,
    fastCheckImport: MESSAGE,
    propCall: MESSAGE,
  },
} as const
