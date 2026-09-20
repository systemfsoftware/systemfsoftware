import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  EXTRA_ACTUAL,
  EXTRA_FIX,
  MISSING_ACTUAL,
  MISSING_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  SIGNATURE_EXPECTED,
} from '../workflow-file-export-topology.config.js'
import { workflowFileExportTopology } from '../workflow-file-export-topology.js'

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

const WORKFLOW = '/repo/pkg/src/decide.workflow.ts'
const IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'`

const extraError = {
  messageId: 'extraValueExport' as const,
  data: { name: 'decide.workflow.ts', expected: SIGNATURE_EXPECTED, actual: EXTRA_ACTUAL, fix: EXTRA_FIX },
}

const missingError = {
  messageId: 'missingValueExport' as const,
  data: { name: 'decide.workflow.ts', expected: SIGNATURE_EXPECTED, actual: MISSING_ACTUAL, fix: MISSING_FIX },
}

const reexportError = (source: string) => ({
  messageId: 'reexportFromWorkflowFile' as const,
  data: {
    name: 'a re-export',
    expected: REEXPORT_EXPECTED,
    actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
    fix: REEXPORT_FIX,
  },
})

ruleTester.run('workflow-file-export-topology', workflowFileExportTopology, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowAndSchemaClassesAreTheOnlyExports',
      code: `${IMPORT}
export class Cmd extends S.TaggedClass<Cmd>()('Cmd', { n: S.Int }) {}
export class Err extends S.TaggedError<Err>()('Err', {}) {}
export const decide = Workflow.make(Cmd, (command) => command.n)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_TypeOnlySurfaceSitsBesideTheDecision',
      code: `${IMPORT}
export type Mode = 'a' | 'b'
export interface Shape { n: number }
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_LocalSchemaIsExportedBySpecifier',
      code: `${IMPORT}
class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
export { Cmd }
export const decide = Workflow.make(Cmd, (c) => c)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_TheOneValueExportIsAFactoryReturningMake',
      code: `${IMPORT}
export const traced = (trace: string[]) => Workflow.make((n: number) => {
  trace.push('decide')
  return n
})`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_DefaultExportIsTheSoleValue',
      code: `${IMPORT}
const decide = Workflow.make((n: number) => n)
export default decide`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_FileIsNotAWorkflowFile',
      code: `export const a = 1
export const b = 2
export * from './other.js'`,
      filename: '/repo/pkg/src/helper.ts',
    },
    {
      name: 'Should_Pass_When_FilenameHasMultipleStemSegments',
      code: `export const a = 1
export const b = 2`,
      filename: '/repo/pkg/src/decide.foo.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaUnionDoesNotCountTowardTheOne',
      code: `${IMPORT}
export class A extends S.TaggedClass<A>()('A', {}) {}
export class B extends S.TaggedClass<B>()('B', {}) {}
export const Verdict = S.Union([A, B])
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AHelperIsExportedBesideTheDecision',
      code: `${IMPORT}
export const helper = () => 1
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [extraError],
    },
    {
      name: 'Should_Report_When_OnlySchemasAndTypesAreExported',
      code: `${IMPORT}
export class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
export type CmdType = Cmd`,
      filename: WORKFLOW,
      errors: [missingError],
    },
    {
      name: 'Should_Report_When_StarReexportIsPresent',
      code: `${IMPORT}
export * from './other.js'
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [reexportError('./other.js')],
    },
    {
      name: 'Should_Report_When_NamedReexportIsPresent',
      code: `${IMPORT}
export { foo } from './other.js'
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [reexportError('./other.js')],
    },
    {
      name: 'Should_Report_When_TypeReexportIsPresent',
      code: `${IMPORT}
export type { Foo } from './other.js'
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [reexportError('./other.js')],
    },
    {
      name: 'Should_Report_When_ImportedBindingIsReexported',
      code: `${IMPORT}
import { foo } from './other.js'
export { foo }
export const decide = Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [reexportError('the imported binding foo')],
    },
    {
      name: 'Should_Report_When_CodecUseCountsAsAValueExport',
      code: `${IMPORT}
export class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
export const encode = S.encodeSync(Cmd)
export const decide = Workflow.make(Cmd, (c) => c)`,
      filename: WORKFLOW,
      errors: [extraError],
    },
    {
      name: 'Should_Report_When_DefaultAndNamedValuesBothExport',
      code: `${IMPORT}
export const helper = 1
export default Workflow.make((n: number) => n)`,
      filename: WORKFLOW,
      errors: [extraError],
    },
    {
      name: 'Should_Report_When_FixtureWorkflowExportsTwoValues',
      code: `export const a = 1
export const b = 2`,
      filename: '/repo/pkg/tests/__fixtures__/decide.workflow.ts',
      errors: [
        {
          messageId: 'extraValueExport',
          data: {
            name: 'decide.workflow.ts',
            expected: SIGNATURE_EXPECTED,
            actual: EXTRA_ACTUAL,
            fix: EXTRA_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_PassNearMiss_When_OtherTaggedClassIsNotASchemaExemption',
      code: `class Other { static TaggedClass() { return class {} } }
export class Fake extends Other.TaggedClass() {}
export const decide = 1`,
      filename: WORKFLOW,
      errors: [extraError],
    },
  ],
})
