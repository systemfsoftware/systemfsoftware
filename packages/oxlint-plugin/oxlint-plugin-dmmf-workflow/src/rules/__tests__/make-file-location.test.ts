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
  'a workflow constructed with Workflow.make only in a <stem>.workflow.ts file whose stem is one segment with no periods'
const OUTSIDE_ACTUAL = 'a Workflow.make construction in a file that is not a single-segment <stem>.workflow.ts'
const OUTSIDE_FIX =
  'move this construction into a <stem>.workflow.ts module and import the workflow from here; a workflow only a test uses belongs in tests/__fixtures__/<stem>.workflow.ts'

const SECOND_EXPECTED = 'at most one Workflow.make construction per file'
const SECOND_ACTUAL = 'a second Workflow.make construction in the same file'
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

const makeOnce = (decide = '(input: number) => input', binding = 'decide'): string =>
  `${IMPORT}\nexport const ${binding} = Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide: ${decide} })`

const makeViaAliases = (first: string, second: string): string =>
  `${IMPORT}\nconst W = Workflow\nexport const ${first} = W.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })\nexport const ${second} = Workflow['make']({ decide: (input: number) => input, command: Cmd, decision: Decision, error: NoError })`

ruleTester.run('make-file-location', makeFileLocation, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowFileConstructsOnce',
      code: makeOnce(),
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFileConstructsNothing',
      code: 'export const x = 1',
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Ignore_When_TheBoundaryIsShadowedByALocalBinding',
      code:
        `${IMPORT}\nconst Workflow = { make: (options: unknown) => options }\nWorkflow.make({ command: Cmd, decision: Decision, error: NoError, decide: (x: number) => x })`,
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_TheDecidePropertyReferencesAModuleScopeFunction',
      code:
        `${IMPORT}\nconst decide = (input: number) => input\nexport const workflow = Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileLivesOutsideSrc',
      code: makeOnce(),
      filename: '/repo/pkg/tests/__fixtures__/f.workflow.ts',
    },
    {
      name: 'Should_Pass_When_AnAliasedMakeConstructsOnceInAWorkflowFile',
      code:
        `${IMPORT}\nconst W = Workflow\nexport const decide = W.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_AComputedMakeConstructsOnceInAWorkflowFile',
      code:
        `${IMPORT}\nexport const decide = Workflow['make']({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_AnUnrecognizedWorkflowMemberIsCalled',
      code: `${IMPORT}\nexport const adapter = Workflow.compose({ command: Cmd, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_AConstructionSitsInATypePosition',
      code:
        `${IMPORT}\ntype Key = { [Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide })]: string }`,
      filename: '/repo/pkg/src/run.executor.ts',
    },
    {
      name: 'Should_Pass_When_AConstructionIsAProbeInATypeTestFile',
      code:
        `${IMPORT}\nexpect(Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide })).type.toBe<unknown>()`,
      filename: '/repo/pkg/test-types/Workflow.tst.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_MakeIsConstructedInAnExecutor',
      code: makeOnce(),
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_WorkflowStemCarriesAnExtraPeriod',
      code: makeOnce(),
      filename: '/repo/pkg/src/foo.bar.workflow.ts',
      errors: [outsideError('foo.bar.workflow.ts')],
    },
    {
      name: 'Should_Report_When_MakeIsConstructedInATestFile',
      code: makeOnce(),
      filename: '/repo/pkg/src/__tests__/foo.workflow.test.ts',
      errors: [outsideError('foo.workflow.test.ts')],
    },
    {
      name: 'Should_Report_When_WorkflowFileConstructsTwice',
      code: makeViaAliases('a', 'b'),
      filename: '/repo/pkg/src/decide.workflow.ts',
      errors: [secondError('decide.workflow.ts')],
    },
    {
      name: 'Should_ReportLocationOnly_When_NonConformingFileConstructsTwice',
      code: makeViaAliases('a', 'b'),
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts'), outsideError('run.executor.ts')],
    },
    {
      // The defining package imports `Workflow` relatively, so a resolver keyed only on the
      // package specifier reported nothing in the one package that authors the primitive.
      name: 'Should_Report_When_TheDefiningPackageImportsWorkflowRelatively',
      code:
        `import * as Workflow from './Workflow.js'\nexport const decide = Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/packages/effect-cell-types/src/Cell.ts',
      errors: [outsideError('Cell.ts')],
    },
    {
      // An alias of the workflow import is the same construction: the location rule
      // previously pattern-matched the callee object to the import binding itself,
      // so `const W = Workflow; W.make(...)` walked past in any filename.
      name: 'Should_Report_When_AnAliasedConstructionLivesInAnExecutor',
      code:
        `${IMPORT}\nconst W = Workflow\nexport const adapter = W.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_AComputedConstructionLivesInAnExecutor',
      code:
        `${IMPORT}\nexport const adapter = Workflow['make']({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_ADestructuredConstructionLivesInAnExecutor',
      code:
        `${IMPORT}\nconst { make } = Workflow\nexport const adapter = make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_AWorkflowFileConstructsTwiceThroughAliases',
      code:
        `${IMPORT}\nconst W = Workflow\nexport const a = W.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })\nexport const b = Workflow['make']({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
      errors: [secondError('decide.workflow.ts')],
    },
    {
      name: 'Should_Report_When_AConstructionSitsInAnObjectLiteralKey',
      code:
        `${IMPORT}\nexport const w = { [Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide })]: 1 }`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
    {
      name: 'Should_Report_When_AProbeShapedConstructionLivesInAnExecutor',
      code:
        `${IMPORT}\nexpect(Workflow.make({ command: Cmd, decision: Decision, error: NoError, decide: (input: number) => input })).type.toBe<unknown>()`,
      filename: '/repo/pkg/src/run.executor.ts',
      errors: [outsideError('run.executor.ts')],
    },
  ],
})
