import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowCommandObject } from '../workflow-command-object.js'

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

const WORKFLOW = 'process-claim.workflow.ts'

const commandArityData = (actual: number) => ({
  name: 'exported workflow function',
  expected: 'exactly one type-annotated command object parameter',
  actual: `${actual} parameters`,
  fix: 'replace positional parameters with one command object declared inline in the workflow',
})

const untypedCommandData = {
  name: 'workflow command parameter',
  expected: 'a TypeScript type annotation naming the command object',
  actual: 'no type annotation',
  fix: 'annotate the parameter with the inline S.TaggedClass command type',
}

const notCommandObjectData = (actual: string) => ({
  name: 'workflow command parameter',
  expected: 'a named command object type (TSTypeReference)',
  actual,
  fix: 'declare an inline S.TaggedClass command carrying its TypeId and annotate the parameter with it',
})

const commandNotTaggedClassData = (name: string) => ({
  name,
  expected: 'the command declared as a class extending S.TaggedClass',
  actual: `${name} is declared locally as a schema value or type alias`,
  fix: 'replace the S.Struct declaration with a class extending S.TaggedClass that carries its TypeId',
})

ruleTester.run('workflow-command-object', workflowCommandObject, {
  valid: [
    {
      name: 'Should_Allow_OneAnnotatedParameter_When_ArrowFunctionExport',
      code: `export const processClaim = (command: ProcessClaim) => command`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_OneAnnotatedParameter_When_FunctionDeclarationExport',
      code: `export function processClaim(command: ProcessClaim) { return command }`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_OneAnnotatedDefaultParameter_When_ArrowFunctionExport',
      code: `export const processClaim = (command: ProcessClaim = fallback) => command`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_InvalidCommandShape_When_NotWorkflowFile',
      code: `export const processClaim = (claimId, actorId) => claimId`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Allow_Command_When_AnnotationNamesLocalTaggedClass',
      code: `class ProcessClaimCommand extends S.TaggedClass<ProcessClaimCommand>()('ProcessClaimCommand', {}) {}
export const processClaim = (command: ProcessClaimCommand) => command`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_Command_When_AnnotationNamesLocalTaggedError',
      code: `class ProcessClaimCommand extends S.TaggedError<ProcessClaimCommand>()('ProcessClaimCommand', {}) {}
export const processClaim = (command: ProcessClaimCommand) => command`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Allow_Command_When_AnnotationIsGenericTypeReference',
      code: `export const processClaim = (command: Command<Claim>) => command`,
      filename: WORKFLOW,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_CommandArity_When_TwoParameters',
      code: `export const processClaim = (claim: Claim, actor: Actor) => claim`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandArity', data: commandArityData(2) }],
    },
    {
      name: 'Should_Report_CommandArity_When_ZeroParameters',
      code: `export const processClaim = () => result`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandArity', data: commandArityData(0) }],
    },
    {
      name: 'Should_Report_CommandArity_When_FunctionDeclarationHasZeroParameters',
      code: `export function processClaim() { return result }`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandArity', data: commandArityData(0) }],
    },
    {
      name: 'Should_Report_CommandArity_When_FunctionExpressionHasTwoParameters',
      code: `export const processClaim = function(claim: Claim, actor: Actor) { return claim }`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandArity', data: commandArityData(2) }],
    },
    {
      name: 'Should_Report_UntypedCommand_When_ParameterHasNoAnnotation',
      code: `export const processClaim = (command) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'untypedCommand', data: untypedCommandData }],
    },
    {
      name: 'Should_Report_UntypedCommand_When_DefaultParameterHasNoAnnotation',
      code: `export const processClaim = (command = fallback) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'untypedCommand', data: untypedCommandData }],
    },
    {
      name: 'Should_Report_NotCommandObject_When_ParameterIsStringPrimitive',
      code: `export const processClaim = (command: string) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'notCommandObject', data: notCommandObjectData('TSStringKeyword') }],
    },
    {
      name: 'Should_Report_NotCommandObject_When_ParameterIsNumberPrimitive',
      code: `export const processClaim = (command: number) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'notCommandObject', data: notCommandObjectData('TSNumberKeyword') }],
    },
    {
      name: 'Should_Report_NotCommandObject_When_ParameterIsUnionType',
      code: `export const processClaim = (command: Claim | Actor) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'notCommandObject', data: notCommandObjectData('TSUnionType') }],
    },
    {
      name: 'Should_Report_NotCommandObject_When_DefaultParameterIsBooleanPrimitive',
      code: `export const processClaim = (command: boolean = fallback) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'notCommandObject', data: notCommandObjectData('TSBooleanKeyword') }],
    },
    {
      name: 'Should_Report_CommandNotTaggedClass_When_LocalStructConst',
      code: `const ProcessClaim = S.Struct({ claimId: S.String })
export const processClaim = (command: ProcessClaim) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandNotTaggedClass', data: commandNotTaggedClassData('ProcessClaim') }],
    },
    {
      name: 'Should_Report_CommandNotTaggedClass_When_LocalTypeAlias',
      code: `type ProcessClaim = { claimId: string }
export const processClaim = (command: ProcessClaim) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandNotTaggedClass', data: commandNotTaggedClassData('ProcessClaim') }],
    },
    {
      name: 'Should_Report_CommandNotTaggedClass_When_LocalStructBesideAnotherTaggedClass',
      code: `const ProcessClaim = S.Struct({ claimId: S.String })
class Other extends S.TaggedClass<Other>()('Other', {}) {}
export const processClaim = (command: ProcessClaim) => command`,
      filename: WORKFLOW,
      errors: [{ messageId: 'commandNotTaggedClass', data: commandNotTaggedClassData('ProcessClaim') }],
    },
  ],
})
