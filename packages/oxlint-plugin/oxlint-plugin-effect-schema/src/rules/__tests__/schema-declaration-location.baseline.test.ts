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
  ],
})
