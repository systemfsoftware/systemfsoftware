/**
 * The shell half of the error model: it reads Cloudflare's envelope off a
 * failed HTTP response into the pure {@link CloudflareErrorSignal}, runs the
 * `judge-cloudflare-error` decision, and builds the tagged error the resources
 * branch on. Transport failures (no envelope) become `CloudflareApiError`.
 */
import { Duration, Match, Option, Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import type * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Result from 'effect/Result'
import {
  AlreadyExists,
  CloudflareApiError,
  CloudflareEnvelope,
  type CloudflareError,
  CloudflareErrorSignal,
  Entitlement,
  NotFound,
  RateLimited,
  Validation,
} from './errors.schema.js'
import { judgeCloudflareError } from './judge-cloudflare-error.workflow.js'
import type { CloudflareErrorOutcome } from './judge-cloudflare-error.workflow.js'

export * from './errors.schema.js'

const DEFAULT_RETRY_AFTER_SECONDS = 1

const retryAfterSecondsOf = (response: HttpClientResponse.HttpClientResponse): number =>
  Option.getOrElse(
    Option.filter(
      Option.map(
        Option.fromUndefinedOr(response.headers['retry-after']),
        (header) => Number(header),
      ),
      (seconds) => Number.isFinite(seconds) && seconds >= 0,
    ),
    () => DEFAULT_RETRY_AFTER_SECONDS,
  )

const envelopeOf = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<Option.Option<CloudflareEnvelope>> =>
  Effect.option(response.json).pipe(
    Effect.map((body) => Option.flatMap(body, (value) => Schema.decodeUnknownOption(CloudflareEnvelope)(value))),
  )

const firstEnvelopeError = (
  envelope: Option.Option<CloudflareEnvelope>,
): Option.Option<{ readonly code?: number; readonly message?: string }> =>
  Option.flatMap(
    envelope,
    (parsed) => Option.flatMap(Option.fromUndefinedOr(parsed.errors), (errors) => Arr.head(errors)),
  )

const signalOf = (
  response: HttpClientResponse.HttpClientResponse,
  envelope: Option.Option<CloudflareEnvelope>,
): CloudflareErrorSignal => {
  const first = firstEnvelopeError(envelope)
  return CloudflareErrorSignal.make({
    status: response.status,
    code: Option.getOrElse(
      Option.flatMap(first, (error) => Option.fromUndefinedOr(error.code)),
      () => 0,
    ),
    message: Option.getOrElse(
      Option.flatMap(first, (error) => Option.fromUndefinedOr(error.message)),
      () => `HTTP ${response.status}`,
    ),
    retryAfterSeconds: retryAfterSecondsOf(response),
  })
}

const errorOf = (outcome: CloudflareErrorOutcome): CloudflareError =>
  Match.value(outcome).pipe(
    Match.tag('NotFoundOutcome', (o) => new NotFound({ code: o.code, message: o.message })),
    Match.tag('AlreadyExistsOutcome', (o) => new AlreadyExists({ code: o.code, message: o.message })),
    Match.tag('ValidationOutcome', (o) => new Validation({ code: o.code, message: o.message })),
    Match.tag('RateLimitedOutcome', (o) =>
      new RateLimited({
        code: o.code,
        message: o.message,
        retryAfter: Duration.seconds(o.retryAfterSeconds),
      })),
    Match.tag('EntitlementOutcome', (o) => new Entitlement({ code: o.code, message: o.message })),
    Match.tag('UnclassifiedOutcome', (o) =>
      new CloudflareApiError({ status: o.status, code: o.code, message: o.message })),
    Match.exhaustive,
  )

export const classifyResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, CloudflareError> =>
  envelopeOf(response).pipe(
    Effect.map((envelope) => Result.getOrThrow(judgeCloudflareError(signalOf(response, envelope)))),
    Effect.flatMap((outcome) => Effect.fail(errorOf(outcome))),
  )
