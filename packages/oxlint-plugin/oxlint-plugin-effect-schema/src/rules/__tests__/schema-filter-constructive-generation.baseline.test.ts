import { createRuleTester } from './_tester.js'

import {
  CHECK_SITE_NAME,
  MISSING_ACTUAL,
  MISSING_EXPECTED,
  MISSING_FIX,
} from '../schema-filter-constructive-generation.config.js'
import { schemaFilterConstructiveGeneration } from '../schema-filter-constructive-generation.js'

const ruleTester = createRuleTester()

const discardsError = () => ({
  messageId: 'filterDiscards',
  data: { name: CHECK_SITE_NAME, expected: MISSING_EXPECTED, actual: MISSING_ACTUAL, fix: MISSING_FIX },
})

const deepMemberChain = (root: string, levels: number): string => {
  let expression = root
  for (let level = 0; level < levels; level += 1) {
    expression = `${expression}.p${level}`
  }
  return expression
}

ruleTester.run('schema-filter-constructive-generation', schemaFilterConstructiveGeneration, {
  valid: [
    {
      name: 'Should_Pass_When_StructMemberReceiverIsChecked',
      code: `import { Schema as S } from 'effect'
const bare = S.makeFilter((v: unknown) => v !== null)
const X = S.Struct.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ImportedStructAliasReceiverIsChecked',
      code: `import { Schema as S } from 'effect'
import { Struct } from 'effect/Schema'
const Alias = Struct
const bare = S.makeFilter((v: unknown) => v !== null)
const X = Alias.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_DeclareMemberReceiverIsChecked',
      code: `import { Schema as S } from 'effect'
const bare = S.makeFilter((v: unknown) => v !== null)
const X = S.declare.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Report_When_DeclareAliasReceiverIsChecked',
      code: `import { Schema as S } from 'effect'
const D = S.declare
const bare = S.makeFilter((v: unknown) => v !== null)
const X = D.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Report_When_ABareDeclareCallChainsIntoCheck',
      code: `import { Schema as S } from 'effect'
import { declare } from 'effect/Schema'
const X = declare(() => ({}))
const bare = S.makeFilter((v: unknown) => v !== null)
const Y = X.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Report_When_DeclareOverrideChainSitsAtTheWalkDepthBoundary',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const X = ${
        deepMemberChain('Schema.declare(() => {}).annotate({ toCodecArbitrary: () => nameLink })', 32)
      }.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
  ],
})
