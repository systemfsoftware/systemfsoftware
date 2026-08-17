import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeFileLocation } from '../make-file-location.js'

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

const IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'`

const OUTSIDE_EXPECTED =
  'Workflow.make constructed only in a <stem>.workflow.ts file whose stem is one segment with no periods'
const OUTSIDE_ACTUAL = 'a Workflow.make call in a file that is not a single-segment <stem>.workflow.ts'
const OUTSIDE_FIX =
  'move this construction into a <stem>.workflow.ts module and import the workflow from here; a workflow only a test uses belongs in tests/__fixtures__/<stem>.workflow.ts'

const SECOND_EXPECTED = 'at most one Workflow.make construction per file'
const SECOND_ACTUAL = 'a second Workflow.make call in the same file'
const SECOND_FIX =
  'give each decision its own <stem>.workflow.ts with its __tests__/<stem>.workflow.property.test.ts beside it'

const outsideError = (name: string) => ({
  messageId: 'makeOutsideWorkflowFile',
  data: { name, expected: OUTSIDE_EXPECTED, actual: OUTSIDE_ACTUAL, fix: OUTSIDE_FIX },
})

const secondError = (name: string) => ({
  messageId: 'secondMakeInFile',
  data: { name, expected: SECOND_EXPECTED, actual: SECOND_ACTUAL, fix: SECOND_FIX },
})

ruleTester.run('make-file-location', makeFileLocation, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowFileConstructsOnce',
      code: `${IMPORT}\nexport const decide = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFileConstructsNothing',
      code: 'export const x = 1',
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Ignore_When_TheBoundaryIsShadowedByALocalBinding',
      code: `${IMPORT}\nconst Workflow = { make: (f: unknown) => f }\nWorkflow.make((x: number) => x)`,
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_MakeArgumentIsAModuleScopeFunctionReference',
      code: `${IMPORT}\nconst decide = (input: number) => input\nexport const workflow = Workflow.make(decide)`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileLivesOutsideSrc',
      code: `${IMPORT}\nexport const decide = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/tests/__fixtures__/f.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_MakeIsConstructedInAnExecutor',
      code: `${IMPORT}\nexport const adapter = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_WorkflowStemCarriesAnExtraPeriod',
      code: `${IMPORT}\nexport const decide = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/foo.bar.workflow.ts',
      errors: [outsideError('foo.bar.workflow.ts')],
    },
    {
      name: 'Should_Report_When_MakeIsConstructedInATestFile',
      code: `${IMPORT}\nexport const decide = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/__tests__/foo.workflow.test.ts',
      errors: [outsideError('foo.workflow.test.ts')],
    },
    {
      name: 'Should_Report_When_WorkflowFileConstructsTwice',
      code:
        `${IMPORT}\nexport const a = Workflow.make((input: number) => input)\nexport const b = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/decide.workflow.ts',
      errors: [secondError('decide.workflow.ts')],
    },
    {
      name: 'Should_ReportLocationOnly_When_NonConformingFileConstructsTwice',
      code:
        `${IMPORT}\nexport const a = Workflow.make((input: number) => input)\nexport const b = Workflow.make((input: number) => input)`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts'), outsideError('run.executor.ts')],
    },
    {
      // The defining package imports `Workflow` relatively, so a resolver keyed only on the
      // package specifier reported nothing in the one package that authors the primitive.
      name: 'Should_Report_When_TheDefiningPackageImportsWorkflowRelatively',
      code: `import * as Workflow from './Workflow.js'\nexport const decide = Workflow.make((input: number) => input)`,
      filename: '/repo/packages/effect-cell-types/src/Cell.ts',
      errors: [outsideError('Cell.ts')],
    },
  ],
})
