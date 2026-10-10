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

const deepLocalChain = (levels: number): string => {
  const lines: string[] = [
    `import { Schema as S } from 'effect'`,
    `function build(): unknown {`,
    `  const make = (): unknown => S.Struct({ n: S.Number })`,
    `  const g${levels} = make()`,
    `  const f${levels} = g${levels}`,
  ]
  for (let i = levels - 1; i >= 0; i -= 1) {
    lines.push(`  const g${i} = f${i + 1}()`)
    lines.push(`  const f${i} = g${i}`)
  }
  lines.push(`  return f0()`)
  lines.push(`}`)
  lines.push(`export const x = build()`)
  return lines.join('\n')
}

/**
 * A `.pN` member chain of `levels` accesses, and the local alias ladder a
 * factory body can hold. Each lands one hop past the classifier's 64-level
 * budget (`MAX_CLASSIFY_DEPTH`), where a walk stops.
 */
const deepMemberChain = (levels: number): string => Array.from({ length: levels }, (_, i) => `.p${i}`).join('')

const localAliasChain = (levels: number): string =>
  Array.from(
    { length: levels },
    (_, i) => i === 0 ? `  const a0 = S.Struct({ n: S.Number })` : `  const a${i} = a${i - 1}`,
  ).join('\n')

ruleTester.run('schema-declaration-location', schemaDeclarationLocation, {
  valid: [
    {
      name: 'Should_Pass_When_ANonVocabularyImportMemberIsReferenced',
      code: `import { helper } from './helper.js'
export const x = helper.member`,
      filename: '/repo/pkg/src/zz-byte.ts',
    },
    {
      name: 'Should_Pass_When_ChainedLocalIdentifierFactoriesExceedTheClassifierDepth',
      code: deepLocalChain(40),
      filename: '/repo/pkg/src/zz-byte.ts',
    },
    {
      name: 'Should_Pass_When_AMultiStatementFactoryReturnsAMemberChainPastTheClassifierBudget',
      code: `import { Schema as S } from 'effect'
function leaf(): unknown {
  return S.String
}
function build(): unknown {
  const t = 1
  return leaf()${deepMemberChain(61)}
}
export const x = build()`,
      filename: '/repo/pkg/src/zz-byte.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AForOfPatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
declare const xs: ReadonlyArray<unknown>
for (const { a = S.Struct({ n: S.Number }) } of xs) {
  void a
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('a')],
    },
    {
      name: 'Should_Report_When_AConditionalWrapsTwoSchemaContainers',
      code: `import { Schema as S } from 'effect'
declare const FLAG: boolean
export const P = FLAG ? { a: S.Number } : { b: S.String }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('P')],
    },
    {
      name: 'Should_Report_Unresolved_When_TheVocabularyNamespaceIsCalledDirectly',
      code: `import { Schema } from 'effect'
export const x = Schema(1)`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_When_ATypeInstantiationWrapsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const x = S.Struct({ a: S.Number })<unknown>`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_When_ACurriedDomainSchemaConstructorBuildsAConst',
      code: `import { Schema as S } from 'effect'
const E = { Schema: (fields: unknown) => (extra: unknown) => fields }
export const x = E.Schema({ a: S.String })({ b: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      name: 'Should_Report_Unresolved_When_ALocalFactoryReturnsALongLocalAliasChain',
      code: `import { Schema as S } from 'effect'
function build(): unknown {
${localAliasChain(71)}
  return a70
}
export const x = build()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      name: 'Should_Report_When_ANamedClassComputedFieldKeyIsNotNameable',
      code: `import { Schema as S } from 'effect'
export class Box { [1] = S.Struct({ value: S.Number }) }`,
      filename: '/repo/pkg/src/box.ts',
      errors: [error('Box')],
    },
    {
      name: 'Should_Report_When_AnAnonymousClassFieldKeyIsNameable',
      code: `import { Schema as S } from 'effect'
export default class { schema = S.Struct({ value: S.Number }) }`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('schema')],
    },
  ],
})
