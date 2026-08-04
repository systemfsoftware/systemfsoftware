import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowSchemaRequired } from '../workflow-schema-required.js'

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

const twoNonCommandVariants = `
class ProcessClaimCommand extends S.TaggedClass<ProcessClaimCommand>()('ProcessClaimCommand', {}) {}
class ClaimApproved extends S.TaggedClass<ClaimApproved>()('ClaimApproved', {}) {}
class ClaimDenied extends S.TaggedError<ClaimDenied>()('ClaimDenied', {}) {}
`

const directFormVariants = `
class DirectDecision extends S.TaggedClass<DirectDecision>('DirectDecision', {}) {}
class DirectError extends S.TaggedError<DirectError>('DirectError', {}) {}
`

const nearMissesValid = `
class ValidDecisionA extends S.TaggedClass<ValidDecisionA>()('ValidDecisionA', {}) {}
class ValidDecisionB extends S.TaggedClass<ValidDecisionB>()('ValidDecisionB', {}) {}
class ValidError extends S.TaggedError<ValidError>()('ValidError', {}) {}
class SchemaCurried extends Schema.TaggedClass<SchemaCurried>()('SchemaCurried', {}) {}
class SchemaDirect extends Schema.TaggedClass<SchemaDirect>('SchemaDirect', {}) {}
class OtherCurried extends Other.TaggedClass<OtherCurried>()('OtherCurried', {}) {}
class OtherDirect extends Other.TaggedClass<OtherDirect>('OtherDirect', {}) {}
class Struct extends S.Struct({}) {}
class ComputedCurried extends S['TaggedClass']<ComputedCurried>()('ComputedCurried', {}) {}
class ComputedDirect extends S['TaggedClass']('ComputedDirect', {}) {}
class PlainCurried extends SomeCall()() {}
class PlainCall extends SomeCall() {}
`

const onlyPlainInterfaces = `
export interface ReadInviteLinkCommand { readonly rawLink: string }
export type InviteLinkReadout = { readonly _tag: 'InviteReadable' } | { readonly _tag: 'InviteUnreadable' }
`

const oneCommandAndOneDecision = `
class CancelOrderCommand extends S.TaggedClass<CancelOrderCommand>()('CancelOrderCommand', {}) {}
class OrderCancelled extends S.TaggedClass<OrderCancelled>()('OrderCancelled', {}) {}
`

const oneDecisionOnly = `
class OrderConfirmed extends S.TaggedClass<OrderConfirmed>()('OrderConfirmed', {}) {}
`

const onlyCommand = `
class CancelOrderCommand extends S.TaggedClass<CancelOrderCommand>()('CancelOrderCommand', {}) {}
`

const nearMissSchemaNotCounted = `
class RealDecision extends S.TaggedClass<RealDecision>()('RealDecision', {}) {}
class FakeDecision extends Schema.TaggedClass<FakeDecision>()('FakeDecision', {}) {}
`

const nearMissOtherNotCounted = `
class RealDecision extends S.TaggedClass<RealDecision>()('RealDecision', {}) {}
class FakeDecision extends Other.TaggedClass<FakeDecision>()('FakeDecision', {}) {}
`

const directNearMissesLeaveOne = `
class ValidDecision extends S.TaggedClass<ValidDecision>('ValidDecision', {}) {}
class SchemaDirect extends Schema.TaggedClass<SchemaDirect>('SchemaDirect', {}) {}
class OtherDirect extends Other.TaggedClass<OtherDirect>('OtherDirect', {}) {}
class Struct extends S.Struct({}) {}
class ComputedDirect extends S['TaggedClass']('ComputedDirect', {}) {}
class PlainCall extends SomeCall() {}
`

const commandTwoDecisionsNoError = `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class UserAlreadyInvited extends S.TaggedClass<UserAlreadyInvited>()('UserAlreadyInvited', {}) {}
export const decideInvite = (cmd: InviteUserCommand): InviteVerdict => new UserInvited({})
`

const commandDecisionAndError = `
import * as Either from 'effect/Either'
export class ProcessInviteCommand extends S.TaggedClass<ProcessInviteCommand>()('ProcessInviteCommand', {}) {}
export class InviteAccepted extends S.TaggedClass<InviteAccepted>()('InviteAccepted', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: ProcessInviteCommand): Either.Either<InviteAccepted, InviteFailed> =>
  Either.right(new InviteAccepted({}))
`

const decorativeErrorBareUnionReturn = `
export class DecoyError extends S.TaggedError<DecoyError>()('DecoyError', {}) {}
export class Allow extends S.TaggedClass<Allow>()('Allow', {}) {}
export class Block extends S.TaggedClass<Block>()('Block', {}) {}
export type DelegationVerdict = Allow | Block
export const decideNoSkillDelegation = (cmd: CheckDelegationCommand): DelegationVerdict => new Allow()
`

const eitherWithUndeclaredErrorType = `
import * as Either from 'effect/Either'
export class RealHookError extends S.TaggedError<RealHookError>()('RealHookError', {}) {}
export class HookDecisionA extends S.TaggedClass<HookDecisionA>()('HookDecisionA', {}) {}
export class HookDecisionB extends S.TaggedClass<HookDecisionB>()('HookDecisionB', {}) {}
export const interpretHookResult = (cmd: InterpretHookCommand): Either.Either<HookDecisionA | HookDecisionB, Error> =>
  Either.right(new HookDecisionA({}))
`

const onlyNearMisses = `
class SchemaCurried extends Schema.TaggedClass<SchemaCurried>()('SchemaCurried', {}) {}
class SchemaDirect extends Schema.TaggedClass<SchemaDirect>('SchemaDirect', {}) {}
class OtherCurried extends Other.TaggedClass<OtherCurried>()('OtherCurried', {}) {}
class OtherDirect extends Other.TaggedClass<OtherDirect>('OtherDirect', {}) {}
class Struct extends S.Struct({}) {}
class ComputedCurried extends S['TaggedClass']<ComputedCurried>()('ComputedCurried', {}) {}
class ComputedDirect extends S['TaggedClass']('ComputedDirect', {}) {}
class PlainCurried extends SomeCall()() {}
class PlainCall extends SomeCall() {}
`

ruleTester.run('workflow-schema-required', workflowSchemaRequired, {
  valid: [
    {
      name: 'Should_Pass_When_Two_Non_Command_Variants_Exist',
      code: twoNonCommandVariants,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Direct_TaggedClass_Form_Is_Used',
      code: directFormVariants,
      filename: 'direct-decision.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Handler_File_Contains_Plain_Types',
      code: onlyPlainInterfaces,
      filename: 'read-invite-link.handler.ts',
    },
    {
      name: 'Should_Pass_When_Near_Miss_Namespaces_Are_Not_Counted',
      code: nearMissesValid,
      filename: 'near-miss.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Two_Decisions_And_An_Error_With_No_Command',
      code: `
        class DecisionA extends S.TaggedClass<DecisionA>()('DecisionA', {}) {}
        class DecisionB extends S.TaggedClass<DecisionB>()('DecisionB', {}) {}
        class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {}) {}
      `,
      filename: 'two-decisions.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Command_Decision_And_Error_Return_An_Either',
      code: commandDecisionAndError,
      filename: 'process-invite.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Either_Error_Type_Is_Qualified_Reference',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited, Namespace.InviteFailed> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Either_Error_Type_Is_Mixed_Union',
      code: `
import * as Either from 'effect/Either'
export class HookDecisionA extends S.TaggedClass<HookDecisionA>()('HookDecisionA', {}) {}
export class HookDecisionB extends S.TaggedClass<HookDecisionB>()('HookDecisionB', {}) {}
export class HookError extends S.TaggedError<HookError>()('HookError', {}) {}
export const interpretHookResult = (cmd: InterpretHookCommand): Either.Either<HookDecisionA | HookDecisionB, HookError | UndeclaredProblem> =>
  Either.right(new HookDecisionA({}))
`,
      filename: 'hook-verdict.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Either_Error_Type_Is_Parenthesized',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited, (InviteFailed)> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportedFunctionDeclaration_Returns_Backed_Either',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export function decideInvite(cmd: InviteUserCommand): Either.Either<UserInvited, InviteFailed> {
  return Either.right(new UserInvited({}))
}
`,
      filename: 'invite-user.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportedFunctionExpression_Returns_Backed_Either',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = function (cmd: InviteUserCommand): Either.Either<UserInvited, InviteFailed> {
  return Either.right(new UserInvited({}))
}
`,
      filename: 'invite-user.workflow.ts',
    },
    {
      name: 'Should_Pass_When_Plain_Class_And_NonCallSuper_Are_Not_Counted',
      code: `
class Plain {}
class Derived extends SomeValue {}
class DecisionA extends S.TaggedClass<DecisionA>()('DecisionA', {}) {}
class DecisionB extends S.TaggedClass<DecisionB>()('DecisionB', {}) {}
class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {}) {}
`,
      filename: 'plain-classes.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NoSchemaVariants_When_Only_Plain_Types_Are_Declared',
      code: onlyPlainInterfaces,
      filename: 'read-invite-link.workflow.ts',
      errors: [
        {
          messageId: 'noSchemaVariants',
          data: {
            name: 'read-invite-link.workflow.ts',
            expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
            actual: 'no S.TaggedClass or S.TaggedError declaration',
            fix:
              'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Only_One_Non_Command_Variant_Exists',
      code: oneCommandAndOneDecision,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'cancel-order.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'cancel-order.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '1',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Only_One_Variant_Exists_And_No_Command',
      code: oneDecisionOnly,
      filename: 'one-outcome.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'one-outcome.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'one-outcome.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '1',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Only_A_Command_Exists',
      code: onlyCommand,
      filename: 'only-command.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'only-command.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'only-command.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '0',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name:
        'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Schema_Namespace_Near_Miss_Is_Not_Counted',
      code: nearMissSchemaNotCounted,
      filename: 'schema-near-miss.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'schema-near-miss.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'schema-near-miss.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '1',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name:
        'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Other_Namespace_Near_Miss_Is_Not_Counted',
      code: nearMissOtherNotCounted,
      filename: 'other-near-miss.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'other-near-miss.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'other-near-miss.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '1',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_And_TooFewDecisionVariants_When_Direct_Near_Misses_Leave_Only_One_Valid',
      code: directNearMissesLeaveOne,
      filename: 'direct-near-misses.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'direct-near-misses.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'no S.TaggedError declaration',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
        {
          messageId: 'tooFewDecisionVariants',
          data: {
            name: 'direct-near-misses.workflow.ts',
            expected: 'at least 2 decision or error variants',
            actual: '1',
            fix:
              'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoSchemaVariants_When_Only_Near_Misses_Are_Present',
      code: onlyNearMisses,
      filename: 'only-near-misses.workflow.ts',
      errors: [
        {
          messageId: 'noSchemaVariants',
          data: {
            name: 'only-near-misses.workflow.ts',
            expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
            actual: 'no S.TaggedClass or S.TaggedError declaration',
            fix:
              'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoSchemaVariants_When_Workflow_File_Is_Empty',
      code: '',
      filename: 'empty.workflow.ts',
      errors: [
        {
          messageId: 'noSchemaVariants',
          data: {
            name: 'empty.workflow.ts',
            expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
            actual: 'no S.TaggedClass or S.TaggedError declaration',
            fix:
              'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Command_And_Two_Decisions_Return_A_Bare_Union',
      code: commandTwoDecisionsNoError,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns InviteVerdict instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_TaggedError_Declared_But_Function_Returns_A_Bare_Union',
      code: decorativeErrorBareUnionReturn,
      filename: 'delegation-verdict.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'delegation-verdict.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns DelegationVerdict instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Union_Error_Type_Has_No_Declared_Member',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited, UnrelatedA | UnrelatedB> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'an Either whose error type references no declared S.TaggedError',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Either_Error_Type_Is_Not_A_Declared_TaggedError',
      code: eitherWithUndeclaredErrorType,
      filename: 'hook-verdict.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'hook-verdict.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'an Either whose error type references no declared S.TaggedError',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_NoSchemaVariants_When_Only_Anonymous_Default_Class_Extends_TaggedClass',
      code: `export default class extends S.TaggedClass()() {}`,
      filename: 'anonymous-default.workflow.ts',
      errors: [
        {
          messageId: 'noSchemaVariants',
          data: {
            name: 'anonymous-default.workflow.ts',
            expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
            actual: 'no S.TaggedClass or S.TaggedError declaration',
            fix:
              'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Either_Has_Single_Type_Argument',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'an Either whose error type references no declared S.TaggedError',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_ExportedFunction_Has_No_Return_Type',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand) => Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns no declared return type instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Return_Type_Is_Qualified_Non_Either',
      code: `
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Verdicts.InviteVerdict => new UserInvited({})
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns InviteVerdict instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Return_Type_Is_Primitive',
      code: `
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): string => 'invited'
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns TSStringKeyword instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Return_Type_Is_Bare_Union',
      code: `
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): UserInvited | InviteFailed => new UserInvited({})
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'the exported function returns a bare union instead of an Either',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Error_Type_Is_This_Reference',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited, this> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'an Either whose error type references no declared S.TaggedError',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
    {
      name: 'Should_Report_MissingErrorChannel_When_Error_Type_Is_Primitive',
      code: `
import * as Either from 'effect/Either'
export class InviteUserCommand extends S.TaggedClass<InviteUserCommand>()('InviteUserCommand', {}) {}
export class UserInvited extends S.TaggedClass<UserInvited>()('UserInvited', {}) {}
export class InviteFailed extends S.TaggedError<InviteFailed>()('InviteFailed', {}) {}
export const decideInvite = (cmd: InviteUserCommand): Either.Either<UserInvited, string> =>
  Either.right(new UserInvited({}))
`,
      filename: 'invite-user.workflow.ts',
      errors: [
        {
          messageId: 'missingErrorChannel',
          data: {
            name: 'invite-user.workflow.ts',
            expected:
              'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
            actual: 'an Either whose error type references no declared S.TaggedError',
            fix:
              'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
          },
        },
      ],
    },
  ],
})
