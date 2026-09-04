import { createRuleTester } from './_tester.js'

import {
  CHECK_SITE_NAME,
  EXPORTED_FIX,
  EXPORTED_NAME,
  LEGACY_ACTUAL,
  LEGACY_EXPECTED,
  LEGACY_FIX,
  MISSING_ACTUAL,
  MISSING_EXPECTED,
  MISSING_FIX,
} from '../schema-filter-constructive-generation.config.js'
import { schemaFilterConstructiveGeneration } from '../schema-filter-constructive-generation.js'

const ruleTester = createRuleTester()

const NAME = CHECK_SITE_NAME

const discardsError = () => ({
  messageId: 'filterDiscards',
  data: { name: NAME, expected: MISSING_EXPECTED, actual: MISSING_ACTUAL, fix: MISSING_FIX },
})

const legacyError = () => ({
  messageId: 'legacyArbitraryFunction',
  data: { name: NAME, expected: LEGACY_EXPECTED, actual: LEGACY_ACTUAL, fix: LEGACY_FIX },
})

const exportedDiscardsError = () => ({
  messageId: 'filterDiscards',
  data: { name: EXPORTED_NAME, expected: MISSING_EXPECTED, actual: MISSING_ACTUAL, fix: EXPORTED_FIX },
})

const exportedLegacyError = () => ({
  messageId: 'legacyArbitraryFunction',
  data: { name: EXPORTED_NAME, expected: LEGACY_EXPECTED, actual: LEGACY_ACTUAL, fix: LEGACY_FIX },
})

ruleTester.run('schema-filter-constructive-generation', schemaFilterConstructiveGeneration, {
  valid: [
    {
      name: 'Should_Pass_When_InlineFilterCarriesConstraint',
      code: `import { Schema } from 'effect'
const prime = Schema.makeFilter((v: number) => isPrime(v), {
  expected: 'a prime number',
  arbitrary: { constraint: { integer: true, ordered: { order: Order.Number, minimum: 2 } } },
})
const Prime = Schema.Finite.check(prime)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_InlineFilterCarriesCandidate',
      code: `import { Schema } from 'effect'
const palindrome = Schema.makeFilter((v: string) => isPalindrome(v), {
  expected: 'a palindrome',
  arbitrary: { candidate: { weight: 5, make: (fc) => fc.string().map(halfToPalindrome) } },
})
const Palindrome = Schema.String.check(palindrome)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_SharedBindingCarriesMetadata',
      code: `import { Schema as S } from 'effect'
const uniqueSlots = S.makeFilter((g: Group) => uniqueIds(g.slots), {
  expected: 'unique slot ids',
  arbitrary: { candidate: { weight: 5, make: (fc) => slotArb.map(dedupeById) } },
})
const Group = S.Struct({ slots: S.Array(Slot) }).check(uniqueSlots)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_FilterBindingIsImported',
      code: `import { Schema } from 'effect'
import { importedFilter } from './filters.js'
const X = Schema.String.check(importedFilter)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_BuiltInFilterUsedInline',
      code: `import { Schema } from 'effect'
const Username = Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(20))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_NodeOverridePrecedesCheck',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.String.annotate({ toArbitrary: () => (fc) => fc.constantFrom('Alice', 'Dante') }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_OverrideLivesOnLocalReceiverDeclaration',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Person = Schema.Struct({ name: Schema.String }).annotate({ toArbitrary: () => (fc) => fc.constant({ name: 'x' }) })
const Named = Person.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_CheckArgumentIsLocalNonFilter',
      code: `import { Schema } from 'effect'
const helper = (v: number) => v > 0
const X = Schema.Number.check(helper)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AnnotationsCarrySpread',
      code: `import { Schema } from 'effect'
const hints = { arbitrary: { constraint: { integer: true } } }
const odd = Schema.makeFilter((v: number) => isOdd(v), { ...hints, expected: 'odd' })
const Odd = Schema.Finite.check(odd)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_MethodOnNonVocabularyReceiver',
      code: `const config = { check: (x: unknown) => x }
const result = config.check(myValue)`,
      filename: '/repo/pkg/src/other.ts',
    },
    {
      name: 'Should_Pass_When_ExportedFilterCarriesMetadata',
      code: `import { Schema } from 'effect'
export const prime = Schema.makeFilter((v: number) => isPrime(v), {
  expected: 'a prime number',
  arbitrary: { constraint: { integer: true } },
})`,
      filename: '/repo/pkg/src/filters.schema.ts',
    },
    {
      name: 'Should_Pass_When_DeadFilterIsNotExported',
      code: `import { Schema } from 'effect'
const unused = Schema.makeFilter((v: number) => v > 0)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_DestructuredCheckReceivesHintedFilter',
      code: `import { Schema } from 'effect'
const { check } = Schema
const prime = Schema.makeFilter((v: number) => isPrime(v), {
  expected: 'a prime number',
  arbitrary: { constraint: { integer: true } },
})
const Prime = check(prime)(Schema.Finite)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_InlineFilterHasNoAnnotations',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0)
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_SharedBindingHasNoMetadata',
      code: `import { Schema } from 'effect'
const uniqueSlots = Schema.makeFilter((g: Group) => uniqueIds(g.slots), { expected: 'unique slot ids' })
const Group = Schema.Struct({ slots: Schema.Array(Slot) }).check(uniqueSlots)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ArbitraryIsFunctionValued',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0, { arbitrary: (fc) => fc.integer({ min: 1 }) })
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [legacyError()],
    },
    {
      name: 'Should_Fail_When_FilterGroupHasNoAnnotations',
      code: `import { Schema } from 'effect'
const pair = Schema.makeFilterGroup([Schema.isMinLength(1), myFilter])
const X = Schema.String.check(pair)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_OverrideComesAfterCheck',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.String.check(bare).annotate({ toArbitrary: () => (fc) => fc.constant('') })`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_SecondArgumentLacksMetadata',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isTag(v), { expected: 'a tag' })
const X = Schema.String.check(Schema.isMinLength(1), bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_AliasNamespaceForm',
      code: `import { Schema as S } from 'effect'
const bare = S.makeFilter((v: number) => v > 0)
const X = S.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ObjectArbitraryLacksBothKeys',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0, { expected: 'positive', arbitrary: { note: 1 } })
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ExportedFilterHasNoMetadata',
      code: `import { Schema } from 'effect'
export const bare = Schema.makeFilter((v: number) => v > 0)`,
      filename: '/repo/pkg/src/filters.schema.ts',
      errors: [exportedDiscardsError()],
    },
    {
      name: 'Should_Fail_When_ExportSpecifierNamesUnhintedFilter',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0)
export { bare }`,
      filename: '/repo/pkg/src/filters.schema.ts',
      errors: [exportedDiscardsError()],
    },
    {
      name: 'Should_Fail_Once_When_ExportedFilterAlsoCheckedLocally',
      code: `import { Schema } from 'effect'
export const bare = Schema.makeFilter((v: number) => v > 0)
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [exportedDiscardsError()],
    },
    {
      name: 'Should_Fail_When_ExportedFilterIsLegacy',
      code: `import { Schema } from 'effect'
export const bare = Schema.makeFilter((v: number) => v > 0, { arbitrary: (fc) => fc.integer({ min: 1 }) })`,
      filename: '/repo/pkg/src/filters.schema.ts',
      errors: [exportedLegacyError()],
    },
    {
      name: 'Should_Fail_When_CheckIsDestructured',
      code: `import { Schema } from 'effect'
const { check } = Schema
const bare = Schema.makeFilter((v: number) => v > 0)
const X = check(bare)(Schema.Finite)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_CheckIsImportedByName',
      code: `import { check } from 'effect/Schema'
import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0)
const X = check(bare)(Schema.Finite)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ForeignAnnotateSilencesReceiver',
      code: `import { Schema } from 'effect'
import { builder } from './builder.js'
const bare = Schema.makeFilter((v: number) => v > 0)
const X = builder.annotate({ toArbitrary: () => (fc) => fc.integer({ min: 1 }) }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
  ],
})
