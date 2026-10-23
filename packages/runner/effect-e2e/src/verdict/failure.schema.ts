import * as Schema from 'effect/Schema'

import { Cause, ProposedCause } from './cause.schema.js'
import { EvidenceRef } from './check.schema.js'

export const FailureCode = Schema.Literals([
  'MODEL_UNAVAILABLE',
  'MODEL_PROVIDER_FAILED',
  'MODEL_REFUSED',
  'AUTH_CREDENTIAL_UNAVAILABLE',
  'AUTH_CREDENTIAL_INVALID',
  'SECRET_UNAVAILABLE',
  'ENVIRONMENT_UNAVAILABLE',
  'APP_UNREACHABLE',
  'APP_NOT_OPEN',
  'ARTIFACT_WRITE_FAILED',
  'LOCATOR_NOT_FOUND',
  'LOCATOR_AMBIGUOUS',
  'ACTION_FAILED',
  'AUTOMATION_UNSUPPORTED',
  'UNSUPPORTED_CAPABILITY',
  'STEP_BUDGET_EXHAUSTED',
  'STEP_TIMEOUT',
  'STEP_NO_CONCLUSION',
  'STEP_NOT_AWAITED',
  'REPLAY_STALE',
  'POLICY_DENIED',
  'CONTEXT_OVERFLOW',
  'MODEL_OUTPUT_INVALID',
  'ASSERTION_INCONCLUSIVE',
  'ASSERTION_FAILED',
  'INTERRUPTED',
  'INTERNAL_ERROR',
])
export type FailureCode = typeof FailureCode.Type

export const Evidence = Schema.NonEmptyArray(EvidenceRef)
export type Evidence = typeof Evidence.Type

export class ModelUnavailable extends Schema.TaggedError<ModelUnavailable>()('MODEL_UNAVAILABLE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ModelProviderFailed extends Schema.TaggedError<ModelProviderFailed>()('MODEL_PROVIDER_FAILED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ModelRefused extends Schema.TaggedError<ModelRefused>()('MODEL_REFUSED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AuthCredentialUnavailable
  extends Schema.TaggedError<AuthCredentialUnavailable>()('AUTH_CREDENTIAL_UNAVAILABLE', {
    message: Schema.String,
    evidence: Evidence,
  })
{}

export class AuthCredentialInvalid extends Schema.TaggedError<AuthCredentialInvalid>()('AUTH_CREDENTIAL_INVALID', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class SecretUnavailable extends Schema.TaggedError<SecretUnavailable>()('SECRET_UNAVAILABLE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class EnvironmentUnavailable extends Schema.TaggedError<EnvironmentUnavailable>()('ENVIRONMENT_UNAVAILABLE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AppUnreachable extends Schema.TaggedError<AppUnreachable>()('APP_UNREACHABLE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AppNotOpen extends Schema.TaggedError<AppNotOpen>()('APP_NOT_OPEN', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ArtifactWriteFailed extends Schema.TaggedError<ArtifactWriteFailed>()('ARTIFACT_WRITE_FAILED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class LocatorNotFound extends Schema.TaggedError<LocatorNotFound>()('LOCATOR_NOT_FOUND', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class LocatorAmbiguous extends Schema.TaggedError<LocatorAmbiguous>()('LOCATOR_AMBIGUOUS', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ActionFailed extends Schema.TaggedError<ActionFailed>()('ACTION_FAILED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AutomationUnsupported extends Schema.TaggedError<AutomationUnsupported>()('AUTOMATION_UNSUPPORTED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class UnsupportedCapability extends Schema.TaggedError<UnsupportedCapability>()('UNSUPPORTED_CAPABILITY', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class StepBudgetExhausted extends Schema.TaggedError<StepBudgetExhausted>()('STEP_BUDGET_EXHAUSTED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class StepTimeout extends Schema.TaggedError<StepTimeout>()('STEP_TIMEOUT', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class StepNoConclusion extends Schema.TaggedError<StepNoConclusion>()('STEP_NO_CONCLUSION', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class StepNotAwaited extends Schema.TaggedError<StepNotAwaited>()('STEP_NOT_AWAITED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ReplayStale extends Schema.TaggedError<ReplayStale>()('REPLAY_STALE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class PolicyDenied extends Schema.TaggedError<PolicyDenied>()('POLICY_DENIED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ContextOverflow extends Schema.TaggedError<ContextOverflow>()('CONTEXT_OVERFLOW', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class ModelOutputInvalid extends Schema.TaggedError<ModelOutputInvalid>()('MODEL_OUTPUT_INVALID', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AssertionInconclusive extends Schema.TaggedError<AssertionInconclusive>()('ASSERTION_INCONCLUSIVE', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class AssertionFailed extends Schema.TaggedError<AssertionFailed>()('ASSERTION_FAILED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class Interrupted extends Schema.TaggedError<Interrupted>()('INTERRUPTED', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export class InternalError extends Schema.TaggedError<InternalError>()('INTERNAL_ERROR', {
  message: Schema.String,
  evidence: Evidence,
}) {}

export const FailureError = Schema.Union([
  ModelUnavailable,
  ModelProviderFailed,
  ModelRefused,
  AuthCredentialUnavailable,
  AuthCredentialInvalid,
  SecretUnavailable,
  EnvironmentUnavailable,
  AppUnreachable,
  AppNotOpen,
  ArtifactWriteFailed,
  LocatorNotFound,
  LocatorAmbiguous,
  ActionFailed,
  AutomationUnsupported,
  UnsupportedCapability,
  StepBudgetExhausted,
  StepTimeout,
  StepNoConclusion,
  StepNotAwaited,
  ReplayStale,
  PolicyDenied,
  ContextOverflow,
  ModelOutputInvalid,
  AssertionInconclusive,
  AssertionFailed,
  Interrupted,
  InternalError,
])
export type FailureError = typeof FailureError.Type

export const FailureRecord = Schema.Struct({
  code: FailureCode,
  cause: Cause,
  evidence: Evidence,
  proposed: Schema.optionalKey(ProposedCause),
})
export type FailureRecord = typeof FailureRecord.Type
