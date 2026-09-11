import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { ACTUAL, EXPECTED, FIX, VIOLATION_NAME } from '../prop-fixture-schema-origin.config.js'
import { propFixtureSchemaOrigin } from '../prop-fixture-schema-origin.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const FILENAME = 'src/DaemonPolicy.schema.ts'
const TEST_FILENAME = 'src/DaemonPolicy.test.ts'

const EXPECTED_DATA = { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX }

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_BARE = 'if (import.meta.vitest) {'
const GUARD_END = '}'

const IMPORTS = `import { Schema as S } from 'effect'
const Lit = S.TaggedStruct('Lit', { value: S.Finite })`

const BAD_INLINE_UNION = `const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
const Chain = S.Union([Lit, Cons])`

ruleTester.run('prop-fixture-schema-origin', propFixtureSchemaOrigin, {
  valid: [
    {
      name: 'Should_StaySilent_When_TheRecursiveUnionEntersThroughANamedBuilder',
      code: `${IMPORTS}
const defineExpr = (build) => build()
${GUARD}
const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
const Chain = defineExpr(() => S.Union([Lit, Cons]))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheRecursiveUnionEntersThroughAnImportedHelper',
      code: `import { buildChain } from './chain.builder.js'
import { Schema as S } from 'effect'
const Lit = S.TaggedStruct('Lit', { value: S.Finite })
${GUARD_BARE}
const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
const Chain = buildChain({ base: [Lit], recur: [Cons] })
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheRecursiveUnionDeclaresItsGenerationIntent',
      code: `${IMPORTS}
${GUARD}
const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
const Chain = S.Union([Lit, Cons]).annotate({
  identifier: 'Chain',
  recursionBudget: { maxDepth: 3, depthSize: 'small' },
})
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheRecursiveUnionDeclaresItsDerivation',
      code: `${IMPORTS}
${GUARD}
const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
const Chain = S.Union([Lit, Cons]).annotate({ identifier: 'Chain', toArbitrary: (fc) => fc.integer() })
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheInlineUnionIsNotRecursive',
      code: `${IMPORTS}
${GUARD}
const Flat = S.Union([S.String, S.Int])
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheInlineRecursiveUnionIsOutsideTestScope',
      code: `${IMPORTS}
${BAD_INLINE_UNION}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheGuardIsNotAnInSourceGuard',
      code: `${IMPORTS}
if (someCondition) {
${BAD_INLINE_UNION}
}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheInlineRecursiveUnionIsInsideTheGuard',
      code: `${IMPORTS}
${GUARD}
${BAD_INLINE_UNION}
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handRolledRecursiveFixture', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_TheInlineRecursiveUnionIsBuiltInsideAnIife',
      code: `${IMPORTS}
${GUARD}
const Chain = (() => {
  const Cons = S.suspend(() => S.Struct({ _tag: S.Literal('Cons'), tail: Chain }))
  return S.Union([Lit, Cons])
})()
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'handRolledRecursiveFixture', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_TheInlineRecursiveUnionIsInATestFile',
      code: `${IMPORTS}
${BAD_INLINE_UNION}`,
      filename: TEST_FILENAME,
      errors: [{ messageId: 'handRolledRecursiveFixture', data: EXPECTED_DATA }],
    },
  ],
})
