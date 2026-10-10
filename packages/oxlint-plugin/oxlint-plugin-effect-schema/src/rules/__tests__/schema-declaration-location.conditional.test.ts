import { createRuleTester } from './_tester.js'

import { schemaDeclarationLocation } from '../schema-declaration-location.js'

const ruleTester = createRuleTester()

const EXPECTED =
  'module-scope schema declarations only in *.schema.ts (any stem, several per file) or in the owning <stem>.workflow.ts'
const ACTUAL =
  'a schema declared in a file that is neither *.schema.ts nor a single-segment <stem>.workflow.ts, in a module-scope position that runs at import'
const FIX =
  'move it to <stem>.schema.ts or into the *.workflow.ts that owns it and import it; a schema a test needs belongs to the production module that owns its concept, and a test harness schema belongs in the tests/ harness file (a *.model.ts or *.fixture.ts) that uses it'

const error = (name: string) => ({
  messageId: 'schemaOutsideSchemaFile',
  data: { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
})

const UNRESOLVED_EXPECTED =
  'a module-scope binding whose initializer the rule can resolve to a definite schema or a definite non-schema'
const UNRESOLVED_ACTUAL =
  'a member or call chain on a base that positively resolves to the Schema vocabulary (the Schema namespace, an alias of it, or a vocabulary-valued handle), where the member, key or intermediate hop could not be statically determined — so the binding MAY hold a schema'
const UNRESOLVED_FIX =
  'declare the schema in <stem>.schema.ts or the owning <stem>.workflow.ts, or make the chain statically resolvable: access the vocabulary through a literal member key instead of a computed one'

const unresolved = (name: string) => ({
  messageId: 'unresolvedSchemaChain',
  data: { name, expected: UNRESOLVED_EXPECTED, actual: UNRESOLVED_ACTUAL, fix: UNRESOLVED_FIX },
})

ruleTester.run('schema-declaration-location', schemaDeclarationLocation, {
  valid: [
    {
      name: 'Should_Pass_When_TheVitestBlockGuardUsesLooseInequality',
      code: `import { Schema } from 'effect'
if (import.meta.vitest != undefined) {
  const LooseGuardError = Schema.TaggedStruct('Loose', { code: Schema.Number })
}`,
      filename: '/repo/pkg/src/loose-guard.kernel.ts',
    },
    {
      name: 'Should_Pass_When_AWorkflowFileSitsUnderADottedDirectory',
      code: `import { Schema } from 'effect'
export const DecideInput = Schema.Struct({ n: Schema.Number })`,
      filename: '/repo/my.plugin/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ANonSchemaEffectMemberIsBound',
      code: `import { Effect } from 'effect'
export const run = Effect.runSync`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ABareMemberOfANonEffectModuleIsCalled',
      code: `import { Schema } from 'not-effect'
export const x = Schema.Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_AConditionalMixesASchemaWrapperAndAPlainValue',
      code: `import { Schema as S } from 'effect'
export const maybe = ENABLED ? { a: S.String } : 42`,
      filename: '/repo/pkg/src/mixed.ts',
    },
    {
      name: 'Should_Pass_When_ANamedUseMemberImportIsBoundAlone',
      code: `import { decode as decodeValue } from 'effect/Schema'
export const x = decodeValue`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ANamespaceSchemaImportIsBoundAlone',
      code: `import * as X from 'effect/Schema'
export const x = X`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ANamedModuleMemberAliasIsBoundAlone',
      code: `import { Schema as SchemaMod } from 'effect/Schema'
const A = SchemaMod.Struct
export const x = A`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ANonEffectSchemaHandleIsMixedWithAPlainValue',
      code: `import { Schema } from 'other'
const ZzVocab = FLAG ? Schema : 42
export const ZzByte = ZzVocab.Struct({ value: 1 })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ANonSchemaEffectHandleIsMixedWithAPlainValue',
      code: `import { Effect } from 'effect'
const ZzVocab = FLAG ? Effect : 42
export const ZzByte = ZzVocab.Struct({ value: 1 })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ABareUseMemberIsMixedWithAPlainValue',
      code: `import { Schema as S } from 'effect'
const ZzVocab = FLAG ? S.decodeSync : 42
export const ZzByte = ZzVocab.Struct({ value: 1 })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ACompoundAssignmentCarriesASchema',
      code: `import { Schema as S } from 'effect'
let zz = 0
zz += S.Struct({ value: S.Number })
export { zz }`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_AModuleAliasIsCyclic',
      code: `let zz = zz
export { zz }`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ASchemaWrapperIsCalledOnANonObjectAssignMember',
      code: `import { Schema as S } from 'effect'
const ZzVocab = Result.assign(S)
export const ZzByte = ZzVocab.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ASchemaWrapperIsCalledOnANonAssignObjectMember',
      code: `import { Schema as S } from 'effect'
const ZzVocab = Object.freeze(S)
export const ZzByte = ZzVocab.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_NestedArraysExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
export const x = ${'['.repeat(65)}S.Struct({ a: S.Number })${']'.repeat(65)}`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_NestedConditionalsExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
export const x = ${'A ? ('.repeat(69)}S.Struct({ a: S.Number })${') : S.String'.repeat(69)}`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_NestedLogicalExpressionsExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
export const x = ${'S.String && ('.repeat(69)}S.Struct({ a: S.Number })${')'.repeat(69)}`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_NestedMemberAccessExceedsTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
const o = { v: S }
export const x = o${'.v'.repeat(70)}`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ChainedIifesExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
export const x = ${'(() => '.repeat(40)}S.Struct({ a: S.Number })${')()'.repeat(40)}`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ChainedFunctionDeclarationsExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
${
        Array.from({ length: 41 }, (_, i) =>
          i === 0
            ? `function f0(): unknown {\n  return S.Struct({ a: S.Number })\n}`
            : `function f${i}(): unknown {\n  return f${i - 1}()\n}`).join('\n')
      }
export const x = f40()`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ChainedConciseFactoriesExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
${
        Array.from({ length: 41 }, (_, i) =>
          i === 0
            ? `const f0 = (): unknown => S.Struct({ a: S.Number })`
            : `const f${i} = (): unknown => f${i - 1}()`).join('\n')
      }
export const x = f40()`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ChainedBlockFactoriesExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
${
        Array.from({ length: 41 }, (_, i) =>
          i === 0
            ? `const f0 = () => {\n  return S.Struct({ a: S.Number })\n}`
            : `const f${i} = () => {\n  return f${i - 1}()\n}`).join('\n')
      }
export const x = f40()`,
      filename: '/repo/pkg/src/types.ts',
    },
    {
      name: 'Should_Pass_When_ChainedMultiStatementFactoriesExceedTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
${
        Array.from({ length: 31 }, (_, i) =>
          i === 0
            ? `const f0 = () => {\n  return S.Struct({ a: S.Number })\n}`
            : `const f${i} = () => {\n  const t${i} = f${i - 1}()\n  return t${i}\n}`).join('\n')
      }
export const x = f30()`,
      filename: '/repo/pkg/src/types.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ANestedObjectWrapperHoldsASchema',
      code: `import { Schema as S } from 'effect'
export const x = { outer: { inner: S.Struct({ a: S.Number }) } }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_Unresolved_When_AWrapperHoldsAnUnresolvedMember',
      code: `import { Schema as S } from 'effect'
const m = 'Stru' + 'ct'
export const x = { a: S[m] }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_When_AConditionalMixesASchemaAndASchemaWrapper',
      code: `import { Schema as S } from 'effect'
export const P = FLAG ? S.String : { a: S.Number }`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('P')],
    },
    {
      name: 'Should_Report_Unresolved_When_AConditionalHasAnUnresolvedArm',
      code: `import { Schema as S } from 'effect'
const m = 'Stru' + 'ct'
export const x = FLAG ? S[m] : S.String`,
      filename: '/repo/pkg/src/types.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_When_ANonNullAssertionWrapsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const x = S.Struct({ a: S.Number })!`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_ATypeAssertionWrapsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const x = <unknown>S.Struct({ a: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AnOptionalChainCallBuildsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const x = S.Struct?.({ a: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AFunctionExpressionIifeBuildsAConstSchema',
      code: `import * as S from 'effect/Schema'
export const x = (function (): unknown { return S.Struct({ a: S.Number }) })()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AFunctionExpressionFactoryResultIsBound',
      code: `import { Schema as S } from 'effect'
const make = function (): unknown { return S.Struct({ a: S.Number }) }
export const x = make()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AFunctionDeclarationFactoryResultIsBound',
      code: `import { Schema as S } from 'effect'
function make(): unknown { return S.Struct({ a: S.Number }) }
export const x = make()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AFactoryCallIsBoundAndItsResultInvoked',
      code: `import { Schema as S } from 'effect'
const build = (): unknown => S.Struct({ a: S.Number })
const make = build()
export const x = make()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('make')],
    },
    {
      name: 'Should_Report_When_ASchemaValueAliasIsInvoked',
      code: `import { Schema as S } from 'effect'
const base = S.Struct({ a: S.Number })
const alias = base
export const x = alias()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('base'), error('alias'), error('x')],
    },
    {
      name: 'Should_Report_When_ABlockBodyFactoryReturnsASchema',
      code: `import { Schema as S } from 'effect'
const make = () => {
  return S.Struct({ a: S.Number })
}
export const x = make()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_Unresolved_When_ABlockBodyFactoryStartsWithAReturn',
      code: `import { Schema as S } from 'effect'
const make = () => {
  return S.Struct({ a: S.Number })
  void 0
}
export const x = make()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_Unresolved_When_AFactoryReturnsTheVocabularyHandle',
      code: `import { Schema as S } from 'effect'
const makeVocab = () => {
  void 0
  return S.Struct
}
export const x = makeVocab()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_When_AnImportedDomainSchemaConstructorBuildsAConst',
      code: `import { Result } from 'effect'
export const x = Result.Schema({ success: true })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AnUnresolvedDomainSchemaConstructorBuildsAConst',
      code: `export const x = Result.Schema({ success: true })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AnImportedDomainSchemaMemberIsBound',
      code: `import { Result } from 'effect'
export const x = Result.Schema`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AnUnresolvedDomainSchemaMemberIsBound',
      code: `export const x = Result.Schema`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_ANamedSchemaValueImportIsBoundAlone',
      code: `import { String as Str } from 'effect/Schema'
export const x = Str`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_AnAnonymousClassComputedFieldInitializesASchema',
      code: `import { Schema as S } from 'effect'
export default class { [1] = S.Struct({ a: S.Number }) }`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('class field')],
    },
    {
      name: 'Should_Report_When_AnArrayPatternBindsASchema',
      code: `import { Schema as S } from 'effect'
const [a] = S.Array(S.Number)
export const g = (): unknown => a`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('a')],
    },
    {
      name: 'Should_Report_When_ANestedArrayInObjectPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const { a: [zz = S.Struct({ value: S.Number })] } = {}
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_ANestedObjectPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const { a: { zz = S.Struct({ value: S.Number }) } } = {}
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_ANestedObjectInArrayPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const [{ zz = S.Struct({ value: S.Number }) }] = []
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_AnArrayElementPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const [zz = S.Struct({ value: S.Number })] = []
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_ANestedArrayPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const [[zz = S.Struct({ value: S.Number })]] = []
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_ASchemaDefaultFollowsASchemaInitializer',
      code: `import { Schema as S } from 'effect'
const { a = S.Struct({ b: S.Number }) } = S.Struct({ c: S.Number })
export { a }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('a')],
    },
    {
      name: 'Should_Report_When_ASchemaDefaultFollowsAUseInitializer',
      code: `import { Schema as S } from 'effect'
const { zz = S.Struct({ value: S.Number }) } = S.decodeUnknownResult(S.String)
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      name: 'Should_Report_When_ASchemaSitsInsideATopLevelForBody',
      code: `import { Schema as S } from 'effect'
for (let i = 0; i < 1; i++) {
  const zzInner = S.Struct({ value: S.Number })
  void zzInner
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzInner')],
    },
    {
      name: 'Should_Report_When_ASchemaSitsInAForInitDeclaration',
      code: `import { Schema as S } from 'effect'
for (const zzInit = S.Struct({ value: S.Number }); false;) {
  break
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzInit')],
    },
    {
      name: 'Should_Report_When_SchemasSitInTryCatchFinallyBlocks',
      code: `import { Schema as S } from 'effect'
try {
  const zzTry = S.Struct({ value: S.Number })
  void zzTry
} catch {
  const zzCatch = S.Struct({ value: S.Number })
  void zzCatch
} finally {
  const zzFinally = S.Struct({ value: S.Number })
  void zzFinally
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzTry'), error('zzCatch'), error('zzFinally')],
    },
    {
      name: 'Should_Report_When_ASchemaSitsInsideALabeledBlock',
      code: `import { Schema as S } from 'effect'
zzLabel: {
  const zzInner = S.Struct({ value: S.Number })
  void zzInner
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzInner')],
    },
    {
      name: 'Should_Report_When_FourNestedArraysSitAtTheClassifierDepth',
      code: `import { Schema as S } from 'effect'
export const x = ${'['.repeat(64)}S.Struct({ a: S.Number })${']'.repeat(64)}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_Unresolved_When_AVocabularyAliasHandleIsReadPastTheAliasDepth',
      code: `import { Schema } from 'effect'
${Array.from({ length: 70 }, (_, i) => `const a${i + 1} = ${i === 0 ? 'Schema' : `a${i}`}`).join('\n')}
const ZzVocab = a70
export const ZzByte = ZzVocab.Struct({ value: 1 })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('ZzByte')],
    },
  ],
})
