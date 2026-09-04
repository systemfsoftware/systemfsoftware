import { createRuleTester } from './_tester.js'

import {
  CHECKED_ELEMENT_ACTUAL,
  CHECKED_ELEMENT_EXPECTED,
  CHECKED_ELEMENT_FIX,
} from '../schema-checked-element-named.config.js'
import { schemaCheckedElementNamed } from '../schema-checked-element-named.js'

const ruleTester = createRuleTester()

const error = (combinator: string) => ({
  messageId: 'anonymousCheckedElement',
  data: {
    name: `an anonymous checked element in ${combinator}`,
    expected: CHECKED_ELEMENT_EXPECTED,
    actual: CHECKED_ELEMENT_ACTUAL,
    fix: CHECKED_ELEMENT_FIX,
  },
})

ruleTester.run('schema-checked-element-named', schemaCheckedElementNamed, {
  valid: [
    {
      name: 'Should_Pass_When_NamedBindingPassedToArray',
      code: `import { Schema as S } from 'effect'
const Checked = S.Struct({ name: S.String }).pipe(S.check((v) => true))
const Result = S.Array(Checked)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ImportedBindingPassedToArray',
      code: `import { Schema as S } from 'effect'
import { Checked } from './checked.js'
const Result = S.Array(Checked)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AnonymousStructHasNoCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.Struct({ name: S.String }))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_CheckLivesInStructField',
      code: `import { Schema as S } from 'effect'
const Result = S.Struct({ name: S.String.pipe(S.check((v) => true)) })`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_NamedBaseWrappedByNonCheckCombinator',
      code: `import { Schema as S } from 'effect'
const Raw = S.Struct({ name: S.String })
const Result = S.Array(S.NullOr(Raw))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ForeignCheckMethodUsedAsElement',
      code: `import { Schema as S } from 'effect'
import { builder } from './builder.js'
const Result = S.Array(builder.check((v) => true))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_MultiCheckChainLivesOnNamedBinding',
      code: `import { Schema as S } from 'effect'
const Base = S.String
const Checked = Base.pipe(S.check((v) => true), S.check((v) => v.length > 0))
const Result = S.Union(Checked, S.Number)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AliasedNamespaceUsedWithNamedBinding',
      code: `import { Schema as Sch } from 'effect'
const Checked = Sch.String.pipe(Sch.check((v) => true))
const Result = Sch.Array(Checked)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_CheckLivesOutsideCollectionElement',
      code: `import { Schema as S } from 'effect'
const Result = S.NullOr(S.String.pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_UnionArrayMembersCarryNoCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_PipedCheckPassedInlineToArray',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.Struct({ name: S.String }).pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_MemberFormCheckPassedInlineToArray',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.String.check((v) => true))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_Only_When_SecondTupleElementCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Tuple(S.String, S.Struct({ name: S.String }).pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Tuple')],
    },
    {
      name: 'Should_Fail_When_VariadicUnionMemberCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Union(S.String, S.Struct({ name: S.String }).pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Union')],
    },
    {
      name: 'Should_Fail_Once_Per_When_UnionArrayMembersCarryChecks',
      code: `import { Schema as S } from 'effect'
import { Wire } from './wire.js'
const Result = S.Union([Wire.mint(Wire.mint(S.Finite).pipe(S.check(S.isGreaterThanOrEqualTo(1)))), Wire.mint(Wire.mint(S.String).pipe(S.check(S.isPattern(/^(100|[1-9]?[0-9])%$/))))])`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Union'), error('Union')],
    },
    {
      name: 'Should_Fail_When_RecordValueCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Record({ key: S.String, value: S.Struct({ name: S.String }).pipe(S.check((v) => true)) })`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Record')],
    },
    {
      name: 'Should_Fail_When_RecordPositionalValueCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Record(S.String, S.String.pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Record')],
    },
    {
      name: 'Should_Fail_When_SetElementCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Set(S.Struct({ name: S.String }).pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Set')],
    },
    {
      name: 'Should_Fail_When_MapValueCarriesCheck',
      code: `import { Schema as S } from 'effect'
const Result = S.Map({ key: S.String, value: S.Struct({ name: S.String }).pipe(S.check((v) => true)) })`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Map')],
    },
    {
      name: 'Should_Fail_When_NamedBaseGainsInlineCheck',
      code: `import { Schema as S } from 'effect'
const Raw = S.Struct({ name: S.String })
const Result = S.Array(Raw.pipe(S.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_Once_When_CheckedElementIsDoublyNested',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.Array(S.Struct({ name: S.String }).pipe(S.check((v) => true))))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_AliasedNamespaceCheckPassedInline',
      code: `import { Schema as Sch } from 'effect'
const Result = Sch.Array(Sch.Struct({ name: Sch.String }).pipe(Sch.check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_DestructuredCheckPassedInline',
      code: `import { Schema as S } from 'effect'
const { check } = S
const Result = S.Array(S.Struct({ name: S.String }).pipe(check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_NamedImportCheckPassedInline',
      code: `import { Schema as S } from 'effect'
import { check } from 'effect/Schema'
const Result = S.Array(S.Struct({ name: S.String }).pipe(check((v) => true)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_Once_When_AnonymousElementCarriesTwoChecks',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.String.pipe(S.check((v) => true), S.check((v) => v.length > 0)))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_CheckedElementHidesBehindAsCast',
      code: `import { Schema as S } from 'effect'
const Result = S.Array(S.Struct({ name: S.String }).pipe(S.check((v) => true)) as S.Schema<{ name: string }>)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
    {
      name: 'Should_Fail_When_CheckedElementHidesBehindSequence',
      code: `import { Schema as S } from 'effect'
const Result = S.Array((0, S.String.pipe(S.check((v) => true))))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [error('Array')],
    },
  ],
})
