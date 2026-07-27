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
      name: 'Should_Pass_When_Exactly_Two_Non_Command_Variants_And_No_Command',
      code: `
        class DecisionA extends S.TaggedClass<DecisionA>()('DecisionA', {}) {}
        class DecisionB extends S.TaggedClass<DecisionB>()('DecisionB', {}) {}
      `,
      filename: 'two-decisions.workflow.ts',
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
      name: 'Should_Report_TooFewDecisionVariants_When_Only_One_Non_Command_Variant_Exists',
      code: oneCommandAndOneDecision,
      filename: 'cancel-order.workflow.ts',
      errors: [
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
      name: 'Should_Report_TooFewDecisionVariants_When_Only_One_Variant_Exists_And_No_Command',
      code: oneDecisionOnly,
      filename: 'one-outcome.workflow.ts',
      errors: [
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
      name: 'Should_Report_TooFewDecisionVariants_When_Only_A_Command_Exists',
      code: onlyCommand,
      filename: 'only-command.workflow.ts',
      errors: [
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
      name: 'Should_Report_TooFewDecisionVariants_When_Schema_Namespace_Near_Miss_Is_Not_Counted',
      code: nearMissSchemaNotCounted,
      filename: 'schema-near-miss.workflow.ts',
      errors: [
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
      name: 'Should_Report_TooFewDecisionVariants_When_Other_Namespace_Near_Miss_Is_Not_Counted',
      code: nearMissOtherNotCounted,
      filename: 'other-near-miss.workflow.ts',
      errors: [
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
      name: 'Should_Report_TooFewDecisionVariants_When_Direct_Near_Misses_Leave_Only_One_Valid',
      code: directNearMissesLeaveOne,
      filename: 'direct-near-misses.workflow.ts',
      errors: [
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
  ],
})
