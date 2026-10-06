import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { cloudflareErrorKind, CloudflareErrorSignal } from './errors.schema.js'

const CloudflareErrorOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/alchemy-cloudflare/CloudflareErrorOutcome',
)
type CloudflareErrorOutcomeTypeId = typeof CloudflareErrorOutcomeTypeId

export class NotFoundOutcome extends Schema.TaggedClass<NotFoundOutcome>()('NotFoundOutcome', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export class AlreadyExistsOutcome extends Schema.TaggedClass<AlreadyExistsOutcome>()('AlreadyExistsOutcome', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export class ValidationOutcome extends Schema.TaggedClass<ValidationOutcome>()('ValidationOutcome', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export class RateLimitedOutcome extends Schema.TaggedClass<RateLimitedOutcome>()('RateLimitedOutcome', {
  code: Schema.Finite,
  message: Schema.String,
  retryAfterSeconds: Schema.Finite,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export class EntitlementOutcome extends Schema.TaggedClass<EntitlementOutcome>()('EntitlementOutcome', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export class UnclassifiedOutcome extends Schema.TaggedClass<UnclassifiedOutcome>()('UnclassifiedOutcome', {
  status: Schema.Finite,
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [CloudflareErrorOutcomeTypeId] = CloudflareErrorOutcomeTypeId
}

export const CloudflareErrorOutcome = Schema.Union([
  NotFoundOutcome,
  AlreadyExistsOutcome,
  ValidationOutcome,
  RateLimitedOutcome,
  EntitlementOutcome,
  UnclassifiedOutcome,
])

export type CloudflareErrorOutcome = typeof CloudflareErrorOutcome.Type

const decideOutcome = (command: CloudflareErrorSignal) =>
  Match.value(cloudflareErrorKind(command)).pipe(
    Match.when(
      'NotFound',
      () => Result.succeed(NotFoundOutcome.make({ code: command.code, message: command.message })),
    ),
    Match.when(
      'AlreadyExists',
      () => Result.succeed(AlreadyExistsOutcome.make({ code: command.code, message: command.message })),
    ),
    Match.when(
      'Validation',
      () => Result.succeed(ValidationOutcome.make({ code: command.code, message: command.message })),
    ),
    Match.when('RateLimited', () =>
      Result.succeed(RateLimitedOutcome.make({
        code: command.code,
        message: command.message,
        retryAfterSeconds: command.retryAfterSeconds,
      }))),
    Match.when(
      'Entitlement',
      () => Result.succeed(EntitlementOutcome.make({ code: command.code, message: command.message })),
    ),
    Match.when('Unknown', () =>
      Result.succeed(UnclassifiedOutcome.make({
        status: command.status,
        code: command.code,
        message: command.message,
      }))),
    Match.exhaustive,
  )

export const judgeCloudflareError = Workflow.make({
  command: CloudflareErrorSignal,
  decision: CloudflareErrorOutcome,
  error: Schema.Never,
  decide: decideOutcome,
})
