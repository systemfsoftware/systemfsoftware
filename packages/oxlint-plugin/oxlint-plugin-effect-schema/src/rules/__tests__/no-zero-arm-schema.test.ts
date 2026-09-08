import { createRuleTester } from './_tester.js'

import { ZERO_ARM_ACTUAL, ZERO_ARM_EXPECTED, ZERO_ARM_FIX } from '../no-zero-arm-schema.config.js'
import { noZeroArmSchema } from '../no-zero-arm-schema.js'

const ruleTester = createRuleTester()

const error = (name: string) => ({
  messageId: 'zeroArmSchema',
  data: {
    name,
    expected: ZERO_ARM_EXPECTED,
    actual: ZERO_ARM_ACTUAL,
    fix: ZERO_ARM_FIX,
  },
})

const UNION_EMPTY = 'a union with no arms'
const LITERALS_EMPTY = 'a literals with no arms'

ruleTester.run('no-zero-arm-schema', noZeroArmSchema, {
  valid: [
    {
      name: 'Should_Pass_When_UnionCarriesMembers',
      code: `import { Schema as S } from 'effect'
const Result = S.Union(S.String, S.Number)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_UnionArrayCarriesMembers',
      code: `import { Schema as S } from 'effect'
const Result = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_LiteralsCarryLiterals',
      code: `import { Schema as S } from 'effect'
const Result = S.Literals('a', 'b')`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AliasedNamespaceUnionCarriesMembers',
      code: `import { Schema as Sch } from 'effect'
const Result = Sch.Union(Sch.String, Sch.Number)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ForeignUnionTakesEmptyArray',
      code: `import { builder } from './builder.js'
const Result = builder.Union([])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ForeignLiteralsTakesNoArguments',
      code: `import { builder } from './builder.js'
const Result = builder.Literals()`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_NeverIsARefusalChannel',
      code: `import { Schema as S } from 'effect'
export const Schema = <A extends S.Constraint = typeof S.Never>(options: { success?: A }) => options`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_UnionTakesEmptyArray',
      code: `import { Schema as S } from 'effect'
const Result = S.Union([])`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(UNION_EMPTY)],
    },
    {
      name: 'Should_Fail_When_AliasedNamespaceUnionTakesEmptyArray',
      code: `import { Schema as Sch } from 'effect'
const Result = Sch.Union([])`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(UNION_EMPTY)],
    },
    {
      name: 'Should_Fail_When_DestructuredUnionTakesEmptyArray',
      code: `import { Schema as S } from 'effect'
const { Union } = S
const Result = Union([])`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(UNION_EMPTY)],
    },
    {
      name: 'Should_Fail_When_NamedImportUnionTakesEmptyArray',
      code: `import { Union } from 'effect/Schema'
const Result = Union([])`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(UNION_EMPTY)],
    },
    {
      name: 'Should_Fail_When_LiteralsTakesNoArguments',
      code: `import { Schema as S } from 'effect'
const Result = S.Literals()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(LITERALS_EMPTY)],
    },
    {
      name: 'Should_Fail_When_NamedImportLiteralsTakesNoArguments',
      code: `import { Literals } from 'effect/Schema'
const Result = Literals()`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error(LITERALS_EMPTY)],
    },
  ],
})
