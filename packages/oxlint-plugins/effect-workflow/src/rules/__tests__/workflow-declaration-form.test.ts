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

const functionDeclarationData = {
  expected: 'export const <name>: Workflow<Command, Decision, Error> = (command) => ...',
  actual: 'an export function declaration',
  fix:
    'rewrite as an annotated const. A function declaration has nowhere to carry the Workflow<...> annotation, so the compiler never checks the contract and the cell degrades to a filename',
}

const missingAnnotationData = {
  expected: 'a Workflow<Command, Decision, Error> type annotation on the const',
  actual: 'an unannotated const',
  fix:
    'annotate it: `export const {{name}}: Workflow<Cmd, Decision, Error> = ...`. Without the annotation tsc infers whatever the body happens to return and the both-channels-inhabited contract goes unchecked',
}

const wrongAnnotationData = {
  expected: 'Workflow<Command, Decision, Error>',
  actual: 'a type annotation that is not Workflow<...>',
  fix:
    'a *.workflow.ts export states its contract as Workflow<Cmd, Decision, Error> from @systemfsoftware/effect-cell-types; any other annotation leaves the cell unverified',
}

ruleTester.run('workflow-declaration-form', workflowDeclarationForm, {
  valid: [
    {
      name: 'Should_Pass_When_ConstAnnotatedAsWorkflow',
      code: `export const decide: Workflow<Command, Decision, Error> = (cmd) => cmd`,
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
      name: 'Should_ReportFunctionDeclaration_When_ExportedFunctionDeclaration',
      code: `export function decide(cmd) { return cmd }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'functionDeclaration',
          data: { name: 'decide', ...functionDeclarationData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingAnnotation_When_UnannotatedArrowConst',
      code: `export const decide = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingAnnotation',
          data: { name: 'decide', ...missingAnnotationData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingAnnotation_When_UnannotatedFunctionExpressionConst',
      code: `export const decide = function (cmd) { return cmd }`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingAnnotation',
          data: { name: 'decide', ...missingAnnotationData },
        },
      ],
    },
    {
      name: 'Should_ReportMissingAnnotation_When_UnannotatedCallExpressionConst',
      code: `export const decide = buildWorkflow()`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'missingAnnotation',
          data: { name: 'decide', ...missingAnnotationData },
        },
      ],
    },
    {
      name: 'Should_ReportWrongAnnotation_When_ConstAnnotatedWithOtherType',
      code: `export const decide: Decision = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'wrongAnnotation',
          data: { name: 'decide', ...wrongAnnotationData },
        },
      ],
    },
    {
      name: 'Should_ReportWrongAnnotation_When_ConstAnnotatedWithQualifiedType',
      code: `export const decide: Some.Namespace = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'wrongAnnotation',
          data: { name: 'decide', ...wrongAnnotationData },
        },
      ],
    },
    {
      name: 'Should_ReportWrongAnnotation_When_ConstAnnotatedWithFunctionType',
      code: `export const decide: (cmd) => void = (cmd) => cmd`,
      filename: 'decide.workflow.ts',
      errors: [
        {
          messageId: 'wrongAnnotation',
          data: { name: 'decide', ...wrongAnnotationData },
        },
      ],
    },
  ],
})
