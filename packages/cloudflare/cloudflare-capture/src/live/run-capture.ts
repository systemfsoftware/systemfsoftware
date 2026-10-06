import { Clock, Config, DateTime, Effect, Option } from 'effect'
import * as Arr from 'effect/Array'
import type { ConfigError } from 'effect/Config'
import type * as HttpBody from 'effect/http/HttpBody'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import type * as Redacted from 'effect/Redacted'
import {
  MissingSecrets,
  ResourceLeak,
  UnobservedErrorCase,
  ZoneRestoreMismatch,
  ZoneSettingsUnreadable,
} from '../capture-errors.schema.js'
import type { CapturedResponse } from '../captured-response.schema.js'
import { type CaptureCase, captureCases, type CaseVariables } from '../case-catalogue.js'
import { type CapturedAttempt, capturedResponseOf, type CaptureMeta } from '../error-capture.js'
import { renderFixture } from '../fixture-writer.js'
import { atPath } from '../json-path.js'
import { loadSecrets } from './config.js'
import { type RawResponse, send } from './http.js'
import { assertNoLeaks } from './leak-check.js'
import { runPrefix } from './resources.js'
import { withRestoredZoneTracing } from './zone-tracing.js'

/** The Cloudflare client-v4 origin every generated operation addresses. */
const REAL_BASE_URL = 'https://api.cloudflare.com/client/v4'

type TransportError = HttpClientError.HttpClientError | HttpBody.HttpBodyError

/** Everything the live lane can fail with. */
export type CaptureError =
  | MissingSecrets
  | ZoneSettingsUnreadable
  | ZoneRestoreMismatch
  | ResourceLeak
  | UnobservedErrorCase
  | ConfigError
  | HttpClientError.HttpClientError
  | HttpBody.HttpBodyError

/**
 * What a completed run produced: one captured answer per catalogue case, and
 * the fixture file's text, sorted by `case`.
 */
export interface CaptureRun {
  readonly records: ReadonlyArray<CapturedResponse>
  readonly fixture: string
}

interface CaseRunOf {
  readonly captureCase: CaptureCase
  readonly variables: CaseVariables
  readonly baseUrl: string
  readonly token: Redacted.Redacted<string>
}

interface OneRunOf extends CaseRunOf {
  readonly capturedOn: string
}

const issueAll = (
  { captureCase, variables, baseUrl, token }: CaseRunOf,
): Effect.Effect<ReadonlyArray<RawResponse>, TransportError, HttpClient.HttpClient> =>
  Effect.forEach(captureCase.exchanges(variables), (exchange) => send({ baseUrl, token, exchange }))

const destroyCreated = (
  { captureCase, variables, baseUrl, token }: CaseRunOf,
  responses: ReadonlyArray<RawResponse>,
): Effect.Effect<void, TransportError, HttpClient.HttpClient> => {
  const created = captureCase.creates
  return created === undefined ? Effect.void : Option.match(Arr.head(responses), {
    onNone: () => Effect.void,
    onSome: (first) =>
      Option.match(Option.flatMap(first.body, (body) => atPath({ value: body, path: created.idPath })), {
        onNone: () => Effect.void,
        onSome: (id) => Effect.asVoid(send({ baseUrl, token, exchange: created.destroy(variables, String(id)) })),
      }),
  })
}

/**
 * Issues one case's exchanges. A case that creates a resource runs under
 * `acquireUseRelease`, so its destroy exchange runs from the scope's finalizer;
 * a case that creates nothing runs straight through.
 */
const issueCase = (run: CaseRunOf): Effect.Effect<ReadonlyArray<RawResponse>, TransportError, HttpClient.HttpClient> =>
  run.captureCase.creates === undefined
    ? issueAll(run)
    : Effect.acquireUseRelease(
      issueAll(run),
      (responses) => Effect.succeed(responses),
      (responses) => destroyCreated(run, responses),
    )

const runCase = (run: CaseRunOf) =>
  run.captureCase.touchesZone === true
    ? withRestoredZoneTracing({
      baseUrl: run.baseUrl,
      token: run.token,
      zoneId: run.variables.zoneId,
      use: () => issueCase(run),
    })
    : issueCase(run)

const attemptOf = (responses: ReadonlyArray<RawResponse>): CapturedAttempt =>
  Option.match(Arr.last(responses), {
    onNone: () => ({ status: 0, body: undefined }),
    onSome: (response) => ({ status: response.status, body: Option.getOrUndefined(response.body) }),
  })

const metaOf = (captureCase: CaptureCase, capturedOn: string): CaptureMeta => ({
  case: captureCase.case,
  operation: captureCase.operation,
  method: captureCase.method,
  endpoint: captureCase.endpoint,
  capturedOn,
})

const observedError = (captureCase: CaptureCase, record: CapturedResponse) =>
  record.status >= 400
    ? Effect.succeed(record)
    : Effect.fail(
      new UnobservedErrorCase({
        message: `case ${captureCase.case} answered ${record.status}, not the expected error`,
        case: captureCase.case,
        status: record.status,
      }),
    )

/**
 * Runs one case and builds its record from the last exchange's answer. The case
 * runs in its own scope, so a zone restore or a resource destroy finalizer fires
 * when the case ends, never at the end of the whole run. A case whose final
 * answer is not an error fails: the fixture cites error cases, so a success
 * means the case's premise is wrong.
 */
const runOne = (
  { captureCase, variables, baseUrl, token, capturedOn }: OneRunOf,
): Effect.Effect<
  CapturedResponse,
  TransportError | ZoneSettingsUnreadable | ZoneRestoreMismatch | UnobservedErrorCase,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const responses = yield* Effect.scoped(runCase({ captureCase, variables, baseUrl, token }))
    const meta = metaOf(captureCase, capturedOn)
    return yield* observedError(captureCase, capturedResponseOf({ meta, attempt: attemptOf(responses) }))
  })

const isoDayOf = (epochMillis: number): string =>
  Option.getOrElse(
    Option.map(DateTime.make(epochMillis), (moment) => DateTime.formatIso(moment).slice(0, 10)),
    () => '1970-01-01',
  )

/**
 * The capture lane: reads its secrets from the environment, mints the run
 * prefix, captures every catalogue case against `baseUrl`, then asserts no
 * prefixed resource survived. Every created resource lives inside a scope that
 * closes before the leak check runs. `baseUrl` defaults to the real Cloudflare
 * client-v4 origin and is the one seam a test points at a loopback edge.
 */
export const captureCloudflare = (
  baseUrl: string = REAL_BASE_URL,
): Effect.Effect<CaptureRun, CaptureError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const secrets = yield* loadSecrets
    const githubRunId = yield* Config.option(Config.String('GITHUB_RUN_ID'))
    const now = yield* Clock.currentTimeMillis
    const variables: CaseVariables = {
      accountId: secrets.accountId,
      zoneId: secrets.zoneId,
      runPrefix: runPrefix({ githubRunId, epochMillis: now }),
    }
    const capturedOn = isoDayOf(now)
    const records = yield* Effect.forEach(
      captureCases,
      (captureCase) => runOne({ captureCase, variables, baseUrl, token: secrets.token, capturedOn }),
      { concurrency: 1 },
    )
    yield* assertNoLeaks({ baseUrl, token: secrets.token, variables })
    return { records, fixture: renderFixture(records) }
  })
