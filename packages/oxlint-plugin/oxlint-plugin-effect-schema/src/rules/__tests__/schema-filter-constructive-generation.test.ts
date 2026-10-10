import { createRuleTester } from './_tester.js'

import {
  CHECK_SITE_NAME,
  EXPORTED_FIX,
  EXPORTED_NAME,
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

const exportedDiscardsError = () => ({
  messageId: 'filterDiscards',
  data: { name: EXPORTED_NAME, expected: MISSING_EXPECTED, actual: MISSING_ACTUAL, fix: EXPORTED_FIX },
})

/**
 * A member chain of `levels` `.p` accesses on top of `root`. The walkers in the
 * rule (`tracesToSchemaTerminal`, `carriesNodeOverride`) visit `root` at depth
 * `levels`, which pins their MAX_WALK_DEPTH = 32 budget: 32 levels put the
 * terminal exactly at the budget, 33 put it beyond it.
 */
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
      name: 'Should_Pass_When_InlineFilterCarriesArbitraryConstraint',
      code: `import { Schema } from 'effect'
const prime = Schema.makeFilter((v: number) => isPrime(v), {
  expected: 'a prime number',
  arbitraryConstraint: { number: 'integer', minimum: 2 },
})
const Prime = Schema.Finite.check(prime)`,
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
    {
      name: 'Should_Pass_When_StructFilterHasNoAnnotations',
      code: `import { Schema as S } from 'effect'
const uniqueSlots = S.makeFilter((g: Group) => uniqueIds(g.slots), { expected: 'unique slot ids' })
const Group = S.Struct({ slots: S.Array(Slot) }).check(uniqueSlots)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_DeclareReceiverCarriesToCodecArbitraryOverride',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.declare<string>(() => {}).annotate({ toCodecArbitrary: () => nameLink }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_StructFilterCarriesArbitraryConstraint',
      code: `import { Schema } from 'effect'
const sized = Schema.makeFilter((g: Record<string, string>) => Object.keys(g).length >= 2, {
  arbitraryConstraint: { minProperties: 2 },
})
const Bag = Schema.Record({ key: Schema.String, value: Schema.String }).check(sized)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_OverrideLivesOnLocalStructDeclaration',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Person = Schema.Struct({ name: Schema.String }).annotate({ toCodecArbitrary: () => nameLink })
const Named = Person.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMinimum',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: number) => v > 0, { arbitraryConstraint: { minimum: 1 } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMaximum',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: number) => v < 10, { arbitraryConstraint: { maximum: 9 } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyExclusiveMinimum',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: number) => v > 0, { arbitraryConstraint: { exclusiveMinimum: 0 } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyExclusiveMaximum',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: number) => v < 10, { arbitraryConstraint: { exclusiveMaximum: 10 } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMinLength',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: string) => v.length > 0, { arbitraryConstraint: { minLength: 1 } })
const X = Schema.String.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMaxLength',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: string) => v.length < 10, { arbitraryConstraint: { maxLength: 9 } })
const X = Schema.String.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMinSize',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: ReadonlyArray<string>) => v.length > 0, { arbitraryConstraint: { minSize: 1 } })
const X = Schema.Array(Schema.String).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMaxSize',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: ReadonlyArray<string>) => v.length < 10, { arbitraryConstraint: { maxSize: 9 } })
const X = Schema.Array(Schema.String).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMinProperties',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: Record<string, string>) => Object.keys(v).length > 0, { arbitraryConstraint: { minProperties: 1 } })
const X = Schema.Record({ key: Schema.String, value: Schema.String }).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyMaxProperties',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: Record<string, string>) => Object.keys(v).length < 10, { arbitraryConstraint: { maxProperties: 9 } })
const X = Schema.Record({ key: Schema.String, value: Schema.String }).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyPatterns',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: string) => v.startsWith('a'), { arbitraryConstraint: { patterns: ['^a'] } })
const X = Schema.String.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyNumber',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: number) => Number.isInteger(v), { arbitraryConstraint: { number: 'integer' } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyUniqueBy',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: ReadonlyArray<{ id: string }>) => v.length > 0, {
  arbitraryConstraint: { uniqueBy: 'id' },
})
const X = Schema.Array(Schema.Struct({ id: Schema.String })).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintCarriesOnlyOrder',
      code: `import { Schema } from 'effect'
const filtered = Schema.makeFilter((v: ReadonlyArray<number>) => v.every((item, i) => i === 0 || item >= v[i - 1]), {
  arbitraryConstraint: { order: 'ascending' },
})
const X = Schema.Array(Schema.Finite).check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ConstraintObjectSpreadsKeys',
      code: `import { Schema } from 'effect'
const base = { minimum: 1 }
const filtered = Schema.makeFilter((v: number) => v > 0, { arbitraryConstraint: { ...base } })
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AnnotateSpreadArgumentCarriesOverride',
      code: `import { Schema } from 'effect'
const extra: unknown[] = []
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.declare(() => {}).annotate(...extra, { toCodecArbitrary: () => nameLink }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_StructChainSitsAtTheWalkDepthBoundary',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: unknown) => v !== null)
const X = ${deepMemberChain('Schema.Struct({ slots: Schema.String })', 32)}.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ForeignMakeFilterArgumentIsChecked',
      code: `import { Schema } from 'effect'
const config = { makeFilter: (predicate: unknown) => predicate }
const X = Schema.Finite.check(config.makeFilter((v: number) => v > 0))`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_CheckArgumentCallIsNotAFilter',
      code: `import { Schema } from 'effect'
const num = Schema.Number(1)
const X = Schema.Finite.check(num)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ExportedValueIsNotAFilter',
      code: `import { Schema } from 'effect'
export const num = Schema.Number(1)`,
      filename: '/repo/pkg/src/filters.schema.ts',
    },
    {
      name: 'Should_Pass_When_MethodNameIsNotCheck',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const X = Schema.Finite.pipe(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_NonCheckIdentifierCallReceivesFilter',
      code: `import { Schema } from 'effect'
const helper = (value: unknown) => value
const bare = Schema.makeFilter((v: number) => v > 0)
const X = helper(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ForwardedCheckIsInvoked',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0)
const X = Schema.check.bind(Schema)(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_ComputedCalleeCallReceivesFilter',
      code: `import { Schema } from 'effect'
const makeHelper = () => (value: unknown) => value
const bare = Schema.makeFilter((v: number) => v > 0)
const X = makeHelper()(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_PrivateCheckMethodIsInvoked',
      code: `import { Schema } from 'effect'
class Holder {
  #check(_filter: unknown): void {}
  run(): void {
    const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
    const X = Schema.String.#check(bare)
  }
}`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_StructAliasIsChecked',
      code: `import { Schema as S } from 'effect'
const Struct = S.Struct
const Alias = Struct
const bare = S.makeFilter((v: unknown) => v !== null)
const X = Alias.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_StructMemberReceiverIsChecked',
      code: `import { Schema as S } from 'effect'
const bare = S.makeFilter((v: unknown) => v !== null)
const X = S.Struct.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_AliasedStructCallIsChecked',
      code: `import { Schema } from 'effect'
const built = Schema.Struct({ slots: Schema.String })
const alias = built
const bare = Schema.makeFilter((v: unknown) => v !== null)
const X = alias.check(bare)`,
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
      name: 'Should_Fail_When_ArbitraryConstraintIsEmptyObject',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0, { arbitraryConstraint: {} })
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_InlineFilterCarriesCandidate',
      code: `import { Schema } from 'effect'
const palindrome = Schema.makeFilter((v: string) => isPalindrome(v), {
  expected: 'a palindrome',
  arbitrary: { candidate: { weight: 5, make: (fc) => fc.string().map(halfToPalindrome) } },
})
const Palindrome = Schema.String.check(palindrome)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_NodeOverrideIsToCodecArbitraryOnScalar',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.String.annotate({ toCodecArbitrary: () => nameLink }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ArbitraryIsFunctionValued',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: number) => v > 0, { arbitrary: (fc) => fc.integer({ min: 1 }) })
const X = Schema.Finite.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
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
const Name = Schema.String.check(bare).annotate({ toCodecArbitrary: () => nameLink })`,
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
      name: 'Should_Fail_When_ExportedFilterCarriesFunctionValuedArbitrary',
      code: `import { Schema } from 'effect'
export const bare = Schema.makeFilter((v: number) => v > 0, { arbitrary: (fc) => fc.integer({ min: 1 }) })`,
      filename: '/repo/pkg/src/filters.schema.ts',
      errors: [exportedDiscardsError()],
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
const X = builder.annotate({ toCodecArbitrary: () => nameLink }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_DeadToArbitraryAnnotateDoesNotSilence',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.String.annotate({ toArbitrary: () => (fc) => fc.constantFrom('Alice', 'Dante') }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_FilterSecondArgumentIsSpread',
      code: `import { Schema } from 'effect'
const hints = [{ arbitraryConstraint: { minimum: 1 } }]
const filtered = Schema.makeFilter((v: number) => v > 0, ...hints)
const X = Schema.Finite.check(filtered)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_DeclareCallCarriesObjectArgument',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.declare({ toCodecArbitrary: () => nameLink }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_PrivateAnnotateCannotSilenceDeclareReceiver',
      code: `import { Schema } from 'effect'
class Holder {
  #annotate(_options: unknown): void {}
  run(): void {
    const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
    const Name = Schema.declare(() => {}).#annotate({ toCodecArbitrary: () => nameLink }).check(bare)
  }
}`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_DeclareAnnotateLacksToCodecArbitrary',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.declare(() => {}).annotate({ toArbitrary: () => (fc: unknown) => fc }).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_DeclareReceiverHasNoOverride',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const Name = Schema.declare(() => {}).check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_InlineMakeFilterArgument',
      code: `import { Schema } from 'effect'
const X = Schema.Finite.check(Schema.makeFilter((v: number) => v > 0))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_InlineMakeFilterGroupArgument',
      code: `import { Schema } from 'effect'
const X = Schema.String.check(Schema.makeFilterGroup([Schema.isMinLength(1)]))`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_ExportedMakeFilterGroupHasNoMetadata',
      code: `import { Schema } from 'effect'
export const group = Schema.makeFilterGroup([Schema.isMinLength(1)])`,
      filename: '/repo/pkg/src/filters.schema.ts',
      errors: [exportedDiscardsError()],
    },
    {
      name: 'Should_Fail_When_AliasToScalarMemberIsChecked',
      code: `import { Schema as S } from 'effect'
const Finite = S.Finite
const Alias = Finite
const bare = S.makeFilter((v: unknown) => v !== null)
const X = Alias.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_StructChainExceedsTheWalkDepth',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: unknown) => v !== null)
const X = ${deepMemberChain('Schema.Struct({ slots: Schema.String })', 33)}.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_StructChainThroughCallExceedsTheWalkDepth',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: unknown) => v !== null)
const X = ${deepMemberChain('Schema.Struct({ slots: Schema.String })', 32)}.pipe().check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_AliasedStructChainExceedsTheWalkDepth',
      code: `import { Schema } from 'effect'
const deep = ${deepMemberChain('Schema.Struct({ slots: Schema.String })', 32)}
const alias = deep
const bare = Schema.makeFilter((v: unknown) => v !== null)
const X = alias.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
    {
      name: 'Should_Fail_When_DeclareChainSitsAtTheWalkDepthBoundary',
      code: `import { Schema } from 'effect'
const bare = Schema.makeFilter((v: string) => isName(v), { expected: 'a name' })
const X = ${deepMemberChain('Schema.declare(() => {})', 32)}.check(bare)`,
      filename: '/repo/pkg/src/domain.schema.ts',
      errors: [discardsError()],
    },
  ],
})
