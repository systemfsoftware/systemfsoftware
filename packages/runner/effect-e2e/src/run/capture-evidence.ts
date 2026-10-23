import * as Arr from 'effect/Array'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import { formatObservation } from '../agent/observation.js'
import type { SecretLedgerShape } from '../agent/secret-ledger.service.js'
import { maskedScreenshotOf } from '../agent/vision.js'
import type { EngineShape } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { ArtifactKind, ArtifactRef, RanAttempt } from '../report/report.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import type { ArtifactWriteFailed, EnvironmentUnavailable, FailureRecord } from '../verdict/failure.schema.js'
import type { ArtifactStoreShape } from './artifact-store.service.js'
import type { ResultDirectory } from './artifact.schema.js'
import type { AttemptTest } from './attempt.js'
import { resultDirectoryOf } from './result-directory.js'
import { renderTracePage, type ScreenSnapshot } from './trace.js'

/** How long the end of a try may spend reading the screen before it gives up on the screenshot and screen text. */
export const CAPTURE_DEADLINE: Duration.Duration = Duration.seconds(5)

const NEVER_OPENED = 'the engine was never opened in this try'
const UNOPENABLE = 'the engine could not be opened in this try'
const TIMED_OUT = `the capture did not finish within ${Duration.format(CAPTURE_DEADLINE)}`

const missingOf = (reason: string): ScreenSnapshot => ({
  text: Result.fail(reason),
  screenshot: Result.fail(reason),
  logs: Result.fail(reason),
})

const reasonOf = (error: { readonly message: string }): string => error.message

const screenshotOf = (
  engine: EngineShape,
  ledger: SecretLedgerShape,
  observed: Result.Result<Observation, string>,
): Effect.Effect<Result.Result<Uint8Array, string>> =>
  Result.match(observed, {
    onFailure: (reason) => Effect.succeed(Result.fail(reason)),
    onSuccess: (observation) =>
      Effect.map(Effect.result(maskedScreenshotOf({ observation, engine, ledger })), Result.mapError(reasonOf)),
  })

const snapshotOf = (engine: EngineShape, ledger: SecretLedgerShape): Effect.Effect<ScreenSnapshot> =>
  Effect.gen(function*() {
    const observed = Result.mapError(yield* Effect.result(engine.observe), reasonOf)
    return {
      text: Result.map(observed, (observation) => formatObservation(observation, ledger.redactCut)),
      screenshot: yield* screenshotOf(engine, ledger, observed),
      logs: Result.mapError(yield* Effect.result(engine.logs), reasonOf),
    }
  })

export interface CaptureScreenRequest {
  /** The try's engine as the session holds it, read without opening one. */
  readonly engine: Option.Option<Result.Result<EngineShape, EnvironmentUnavailable>>
  readonly ledger: SecretLedgerShape
}

/**
 * The screen as the try left it, read under `CAPTURE_DEADLINE`: the masked screenshot, the redacted screen text and
 * the engine logs (design §13.3). Each part that cannot be read says why; this never fails and never opens an engine.
 */
export const captureScreen = (request: CaptureScreenRequest): Effect.Effect<ScreenSnapshot> =>
  Option.match(request.engine, {
    onNone: () => Effect.succeed(missingOf(NEVER_OPENED)),
    onSome: Result.match({
      onFailure: () => Effect.succeed(missingOf(UNOPENABLE)),
      onSuccess: (engine) =>
        Effect.map(
          Effect.timeoutOption(snapshotOf(engine, request.ledger), CAPTURE_DEADLINE),
          Option.getOrElse(() => missingOf(TIMED_OUT)),
        ),
    }),
  })

export interface WriteEvidenceRequest {
  readonly store: ArtifactStoreShape
  readonly ledger: SecretLedgerShape
  readonly test: AttemptTest
  readonly target: string
  readonly agent: string
  readonly attempt: RanAttempt
  readonly screen: ScreenSnapshot
}

export interface WrittenEvidence {
  readonly artifacts: ReadonlyArray<ArtifactRef>
  readonly failures: ReadonlyArray<FailureRecord>
}

const failureRecordOf = (error: ArtifactWriteFailed): FailureRecord => ({
  code: error._tag,
  cause: failureClassOf(error._tag).cause,
  evidence: error.evidence,
})

const textBytesOf = (text: string): Uint8Array => new TextEncoder().encode(text)

const put = (store: ArtifactStoreShape, directory: ResultDirectory, kind: ArtifactKind) =>
(
  bytes: Uint8Array,
): Effect.Effect<Result.Result<ArtifactRef, FailureRecord>> =>
  Effect.map(Effect.result(store.put({ directory, kind, bytes })), Result.mapError(failureRecordOf))

const writtenOf = (results: ReadonlyArray<Result.Result<ArtifactRef, FailureRecord>>): WrittenEvidence => ({
  artifacts: Arr.getSuccesses(results),
  failures: Arr.getFailures(results),
})

/**
 * Writes one try's evidence into its result directory: the screenshot and screen text when they were captured, then
 * `trace.md` linking what was written, with every held secret masked. A store refusal is answered as a failure
 * record for the attempt, never raised.
 */
export const writeEvidence = (request: WriteEvidenceRequest): Effect.Effect<WrittenEvidence> =>
  Effect.gen(function*() {
    const directory = resultDirectoryOf({
      title: request.test.title,
      test: request.test.id,
      target: request.target,
      agent: request.agent,
    })
    const screen = writtenOf(
      yield* Effect.all([
        ...request.screen.screenshot.pipe(
          Result.getSuccess,
          Arr.fromOption,
          Arr.map(put(request.store, directory, 'screenshot')),
        ),
        ...request.screen.text.pipe(
          Result.getSuccess,
          Arr.fromOption,
          Arr.map((text) => put(request.store, directory, 'screen-text')(textBytesOf(text))),
        ),
      ]),
    )
    const page = request.ledger.redact(renderTracePage({ ...request, artifacts: screen.artifacts }))
    const trace = writtenOf([yield* put(request.store, directory, 'trace-page')(textBytesOf(page))])
    return {
      artifacts: [...screen.artifacts, ...trace.artifacts],
      failures: [...screen.failures, ...trace.failures],
    }
  })
