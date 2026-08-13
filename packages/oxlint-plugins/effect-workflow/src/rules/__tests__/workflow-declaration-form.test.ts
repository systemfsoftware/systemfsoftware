import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowDeclarationForm } from '../workflow-declaration-form.js'

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

const missingMakeData = {
  expected: 'export const <name> = Workflow.make((command) => ...)',
  actual: 'an exported const whose initializer is not a call to Workflow.make(...)',
  fix:
    'produce the workflow with `export const <name> = Workflow.make((command) => ...)`, importing { Workflow } from @systemfsoftware/effect-cell-types; only the constructor infers the decision and error channels and derives the UninhabitedDecision / UninhabitedError markers',
}

const functionDeclarationData = {
  expected: 'export const <name> = Workflow.make((command) => ...)',
  actual: 'an exported function declaration — a function declaration cannot carry a Workflow.make(...) call',
  fix: missingMakeData.fix,
}

const annotationInsteadOfMakeData = {
  expected: 'a call to Workflow.make(...) with no type annotation on the const',
  actual: 'a Workflow.Workflow<...> type annotation instead of a Workflow.make(...) call',
  fix:
    'replace the annotation with `export const <name> = Workflow.make((command) => ...)`; a hand-written Workflow.Workflow<...> annotation cannot derive the UninhabitedDecision / UninhabitedError markers that the constructor infers',
}

const localTypeDeclarationData = {
  expected: 'the Workflow type imported from @systemfsoftware/effect-cell-types',
  actual: 'a local `type Workflow<...>` copy of the contract',
  fix:
    'delete the local copy and import { Workflow } from @systemfsoftware/effect-cell-types; a hand-rolled Workflow cannot derive the UninhabitedDecision / UninhabitedError markers',
}

ruleTester.run('workflow-declaration-form', workflowDeclarationForm, {
  valid: [
    {
      name: 'Should_Pass_When_ConstProducedByWorkflowMake',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
export const decide = Workflow.make((cmd) => cmd)`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ConstProducedByAliasedWorkflowMake',
      code: `import { Workflow as W } from '@systemfsoftware/effect-cell-types'
export const decide = W.make((cmd) => cmd)`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonBehaviourConstExported',
      code: `export const FOO = 1`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFile_HasFunctionDeclaration',
      code: `export function decide(cmd) { return cmd }`,
      filename: 'decide.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFile_HasUnannotatedArrow',
      code: `export const decide = (cmd) => cmd`,
      filename: 'decide.executor.ts',
    },
    {
      name: 'Should_Pass_When_DestructuredArrowInitializer',
      code: `export const [f] = () => {}`,
      filename: 'decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SpecifierExport',
      code: `const decide = (cmd) => cmd; export { decide }`,
      filename: 'decide.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportMissingMake_When_ExportedFunctionDeclaration',
      code: `export function decide(cmd) { return cmd }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...functionDeclarationData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingMake_When_BareArrowConst',
      code: `export const decide = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingMake_When_FunctionExpressionConst',
      code: `export const decide = function (cmd) { return cmd }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingMake_When_CallExpressionIsNotMake',
      code: `export const decide = buildWorkflow()`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingMake_When_MakeCalledOnForeignBinding',
      code: `import { Workflow } from 'another-module'
export const decide = Workflow.make((cmd) => cmd)`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingMake_When_MakeCalledOnTypeOnlyImport',
      code: `import type { Workflow } from '@systemfsoftware/effect-cell-types'
export const decide = Workflow.make((cmd) => cmd)`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportAnnotationInsteadOfMake_When_ConstAnnotatedWithPackageWorkflowType',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
export const decide: Workflow.Workflow<Command, Decision, Error> = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'annotationInsteadOfMake',
          data: { name: 'decide', ...annotationInsteadOfMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportAnnotationInsteadOfMake_When_ConstAnnotatedWithAliasedWorkflowType',
      code: `import { Workflow as W } from '@systemfsoftware/effect-cell-types'
export const decide: W.Workflow<Command, Decision, Error> = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'annotationInsteadOfMake',
          data: { name: 'decide', ...annotationInsteadOfMakeData },
        },
      ],
    },
    {
      name: 'Should_ReportLocalTypeDeclaration_When_FileDeclaresOwnWorkflowType',
      code: `type Workflow<Command, Decision, Error> = (command: Command) => Either.Either<Decision, Error>`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'localTypeDeclaration',
          data: { name: 'Workflow', ...localTypeDeclarationData },
        },
      ],
    },
    {
      name: 'Should_ReportLocalTypeDeclarationAndMissingMake_When_LocalCopyBacksExportedWorkflow',
      code: `type Workflow<Command, Decision, Error> = (command: Command) => Either.Either<Decision, Error>
export const decide: Workflow<Command, Decision, Error> = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'localTypeDeclaration',
          data: { name: 'Workflow', ...localTypeDeclarationData },
        },
        {
          messageId: 'missingMake',
          data: { name: 'decide', ...missingMakeData },
        },
      ],
    },
  ],
})
