import { Effect, Equal, Option, Redacted, Schema } from 'effect'
import type * as HttpBody from 'effect/http/HttpBody'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import type * as Scope from 'effect/Scope'
import { ZoneRestoreMismatch, ZoneSettingsUnreadable, ZoneTracingEnvelope } from '../capture-errors.schema.js'
import type { RawValue } from '../captured-response.schema.js'
import { send } from './http.js'

type ZoneTransportError = HttpClientError.HttpClientError | HttpBody.HttpBodyError

/** The origin, credential, and zone one tracing-settings call is built from. */
export interface ZoneSettingsOf {
  readonly baseUrl: string
  readonly token: Redacted.Redacted<string>
  readonly zoneId: string
}

/** A tracing-settings write, carrying the settings to patch. */
export interface ZoneSettingsWriteOf extends ZoneSettingsOf {
  readonly settings: RawValue
}

/** A tracing-settings verification, carrying the snapshot to compare against. */
export interface ZoneSettingsVerifyOf extends ZoneSettingsOf {
  readonly snapshot: RawValue
}

/** A tracing-settings snapshot scope, carrying the work to run between restore points. */
export interface RestoredZoneUseOf<A, E, R> extends ZoneSettingsOf {
  readonly use: (snapshot: RawValue) => Effect.Effect<A, E, R>
}

const settingsPath = (zoneId: string): string => `/zones/${zoneId}/observability/tracing/settings`

/**
 * READs the zone's tracing settings. Every zone setting the lane touches is read
 * before it is patched, so the original value can be restored exactly.
 */
export const readZoneTracing = (
  { baseUrl, token, zoneId }: ZoneSettingsOf,
): Effect.Effect<RawValue, ZoneTransportError | ZoneSettingsUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const response = yield* send({ baseUrl, token, exchange: { method: 'GET', path: settingsPath(zoneId) } })
    return yield* Option.match(
      Option.flatMap(response.body, (body) => Schema.decodeUnknownOption(ZoneTracingEnvelope)(body)),
      {
        onNone: () =>
          Effect.fail(
            new ZoneSettingsUnreadable({
              message: `the zone tracing settings answered without a result for zone ${zoneId}`,
              zoneId,
            }),
          ),
        onSome: (envelope) => Effect.succeed(envelope.result),
      },
    )
  })

/** PATCHes the zone's tracing settings with the supplied object. */
export const writeZoneTracing = (
  { baseUrl, token, zoneId, settings }: ZoneSettingsWriteOf,
): Effect.Effect<void, ZoneTransportError, HttpClient.HttpClient> =>
  Effect.asVoid(
    send({ baseUrl, token, exchange: { method: 'PATCH', path: settingsPath(zoneId), body: settings } }),
  )

/**
 * RE-READs the settings and fails unless they equal the snapshot, so a run that
 * did not restore the zone is a failure rather than a silent mutation.
 */
export const verifyZoneTracing = (
  { baseUrl, token, zoneId, snapshot }: ZoneSettingsVerifyOf,
): Effect.Effect<
  void,
  ZoneTransportError | ZoneSettingsUnreadable | ZoneRestoreMismatch,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const actual = yield* readZoneTracing({ baseUrl, token, zoneId })
    return yield* Equal.equals(actual, snapshot)
      ? Effect.void
      : Effect.fail(
        new ZoneRestoreMismatch({
          message: `the zone tracing settings for ${zoneId} did not read back as restored`,
          zoneId,
        }),
      )
  })

/**
 * READs the settings, runs `use`, then RESTOREs the snapshot and RE-READs it
 * from the scope's finalizer whether `use` succeeded or failed, so a production
 * zone is left exactly as it was found.
 */
export const withRestoredZoneTracing = <A, E, R>(
  { baseUrl, token, zoneId, use }: RestoredZoneUseOf<A, E, R>,
): Effect.Effect<
  A,
  E | ZoneTransportError | ZoneSettingsUnreadable | ZoneRestoreMismatch,
  R | HttpClient.HttpClient | Scope.Scope
> =>
  Effect.acquireUseRelease(
    readZoneTracing({ baseUrl, token, zoneId }),
    use,
    (snapshot) =>
      Effect.gen(function*() {
        yield* writeZoneTracing({ baseUrl, token, zoneId, settings: snapshot })
        yield* verifyZoneTracing({ baseUrl, token, zoneId, snapshot })
      }),
  )
