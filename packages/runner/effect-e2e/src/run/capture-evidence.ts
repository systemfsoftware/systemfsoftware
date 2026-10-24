import * as Arr from 'effect/Array'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { formatObservation } from '../agent/observation.js'
import { redactJson } from '../agent/redaction.js'
import type { SecretLedgerShape } from '../agent/secret-ledger.service.js'
import { maskedScreenshotOf } from '../agent/vision.js'
import type { EngineShape } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { ArtifactKind, ArtifactRef, RanAttempt } from '../report/report.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import { ArtifactWriteFailed, type EnvironmentUnavailable, type FailureRecord } from '../verdict/failure.schema.js'
import { AiTraceJson, type ModelCall } from './ai-trace.schema.js'
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

/** Which result directory a try's files go to: the test, target and agent it ran as. */
export interface EvidenceOwner {
  readonly store: ArtifactStoreShape
  readonly ledger: SecretLedgerShape
  readonly test: AttemptTest
  readonly target: string
  readonly agent: string
}

export interface WrittenEvidence {
  readonly artifacts: ReadonlyArray<ArtifactRef>
  readonly failures: ReadonlyArray<FailureRecord>
}

export const NOTHING_WRITTEN: WrittenEvidence = { artifacts: [], failures: [] }

export interface WriteEvidenceRequest extends EvidenceOwner {
  readonly attempt: RanAttempt
  readonly screen: ScreenSnapshot
  /** What the try already wrote into the directory, so `trace.md` links it. */
  readonly written: WrittenEvidence
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

const directoryOf = (owner: EvidenceOwner): ResultDirectory =>
  resultDirectoryOf({ title: owner.test.title, test: owner.test.id, target: owner.target, agent: owner.agent })

export interface WriteAiTraceRequest extends EvidenceOwner {
  readonly retry: number
  readonly calls: ReadonlyArray<ModelCall>
}

const unencodableOf = (ledger: SecretLedgerShape, error: Schema.SchemaError): FailureRecord =>
  failureRecordOf(
    new ArtifactWriteFailed({
      message: 'could not encode ai-trace.json',
      evidence: [{ _tag: 'LogEvidence', text: ledger.redact(error.message) }],
    }),
  )

/**
 * Writes one try's model calls as `ai-trace.json` into its result directory. The document is encoded to JSON, masked
 * with the ledger before and after serialization, so a held secret survives neither raw nor in JSON-escaped spelling.
 * A refused encode or store write is answered as a failure record, never raised.
 */
export const writeAiTrace = (request: WriteAiTraceRequest): Effect.Effect<WrittenEvidence> =>
  Result.match(
    Schema.encodeResult(AiTraceJson)({
      schema: 'ai-trace-1',
      test: { id: request.test.id, title: request.test.title },
      target: request.target,
      agent: request.agent,
      retry: request.retry,
      calls: request.calls,
    }),
    {
      onFailure: (error) =>
        Effect.succeed<WrittenEvidence>({ artifacts: [], failures: [unencodableOf(request.ledger, error)] }),
      onSuccess: (encoded) =>
        Effect.map(
          put(request.store, directoryOf(request), 'ai-trace')(
            textBytesOf(
              `${request.ledger.redact(JSON.stringify(redactJson(request.ledger.redact)(encoded), null, 2))}\n`,
            ),
          ),
          (result) => writtenOf([result]),
        ),
    },
  )

/**
 * Writes one try's evidence into its result directory: the screenshot and screen text when they were captured, then
 * `trace.md` linking those and what the try already wrote, with every held secret masked. A store refusal is answered
 * as a failure record for the attempt, never raised.
 */
export const writeEvidence = (request: WriteEvidenceRequest): Effect.Effect<WrittenEvidence> =>
  Effect.gen(function*() {
    const directory = directoryOf(request)
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
    const artifacts = [...screen.artifacts, ...request.written.artifacts]
    const page = request.ledger.redact(renderTracePage({ ...request, artifacts }))
    const trace = writtenOf([yield* put(request.store, directory, 'trace-page')(textBytesOf(page))])
    return {
      artifacts: [...artifacts, ...trace.artifacts],
      failures: [...screen.failures, ...request.written.failures, ...trace.failures],
    }
  })
