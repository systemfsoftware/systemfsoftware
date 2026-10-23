import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'

import type { CacheStoreShape } from '../cache/cache-store.service.js'
import type { KeyDigest } from '../cache/key.schema.js'
import {
  type AttemptEnding,
  type EntryWrite,
  SettleRecordings,
  settleRecordings,
  type SettleRecordingsDecision,
  type StagedRecording,
} from '../cache/settle-recordings.workflow.js'
import type { CacheMode, Target } from '../Config/config.schema.js'
import { type ArtifactRef, type Attempt, AttemptId, type RanAttempt, type TestId } from '../report/report.schema.js'
import { finalVerdictOf, runVerdictOf } from '../verdict/exit-code.js'
import type { FailureRecord } from '../verdict/failure.schema.js'
import { FoldRunVerdict, foldRunVerdict } from '../verdict/fold-run-verdict.workflow.js'
import type { RunVerdict } from '../verdict/run-verdict.schema.js'
import type { CacheWrite, StepRecord } from '../verdict/step-record.schema.js'
import {
  AdmitPlatforms,
  admitPlatforms,
  type PlatformAdmission,
  type TestPlatform,
} from './admit-platforms.workflow.js'
import type { Conclusion } from './conclude-attempt.workflow.js'

/** The test a try belongs to, as the report names it. */
export interface AttemptTest {
  readonly id: TestId
  readonly title: string
  readonly file: string
}

/** One try of one test on one target with one agent, in the order the worker recorded it. */
export interface AttemptEntry {
  readonly test: AttemptTest
  readonly target: Target['name']
  readonly agent: string
  readonly attempt: Attempt
  readonly artifacts: ReadonlyArray<ArtifactRef>
}

export interface AttemptLog {
  readonly append: (entry: AttemptEntry) => Effect.Effect<void>
  readonly entries: Effect.Effect<ReadonlyArray<AttemptEntry>>
  /** The run verdict over each test's final attempt, so a test that passes on retry does not fail the run. */
  readonly verdict: Effect.Effect<RunVerdict>
}

export interface AdmitTestRequest {
  readonly log: AttemptLog
  readonly test: AttemptTest
  readonly target: Target
  readonly agent: string
  readonly platforms?: ReadonlyArray<TestPlatform> | undefined
}

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const keyOf = (entry: AttemptEntry): string => JSON.stringify([entry.test.id, entry.target, entry.agent])

const finalAttemptsOf = (entries: ReadonlyArray<AttemptEntry>): ReadonlyArray<Attempt> =>
  Array.from(new Map(entries.map((entry) => [keyOf(entry), entry.attempt])).values())

/** A worker's record of every attempt, which the report and the run verdict are read from. */
export const makeAttemptLog: Effect.Effect<AttemptLog> = Effect.map(
  Ref.make<ReadonlyArray<AttemptEntry>>([]),
  (entries) => ({
    append: (entry) => Ref.update(entries, (all) => [...all, entry]),
    entries: Ref.get(entries),
    verdict: Effect.map(Ref.get(entries), (all) => finalVerdictOf({ finals: finalAttemptsOf(all), runErrors: [] })),
  }),
)

const declaredOf = (platforms: ReadonlyArray<TestPlatform> | undefined) =>
  Option.filter(Option.fromNullishOr(platforms), Arr.isReadonlyArrayNonEmpty)

/**
 * Runs the platform gate before any try (requirements AC-2.5): a test declared for platforms the target
 * lacks records one skipped attempt with the reason, and no session or engine is ever built for it.
 */
export const admitTest = (request: AdmitTestRequest): Effect.Effect<PlatformAdmission> => {
  const admission = decided(
    admitPlatforms(
      new AdmitPlatforms({
        declared: declaredOf(request.platforms),
        platform: request.target.platform,
        target: request.target.name,
      }),
    ),
  )
  return Effect.as(
    Match.valueTags(admission, {
      Admitted: () => Effect.void,
      PlatformSkipped: ({ reason }) =>
        request.log.append({
          test: request.test,
          target: request.target.name,
          agent: request.agent,
          attempt: { _tag: 'Skipped', id: AttemptId.make('attempt-0'), retry: 0, reason },
          artifacts: [],
        }),
    }),
    admission,
  )
}

// --- the end of a try ---------------------------------------------------------------------------

export interface SettleAttemptRequest {
  readonly retry: number
  readonly mode: CacheMode
  readonly store: CacheStoreShape
  readonly conclusion: Conclusion
}

interface Concluded {
  readonly steps: ReadonlyArray<StepRecord>
  readonly errors: ReadonlyArray<FailureRecord>
  readonly staged: ReadonlyArray<StagedRecording>
  readonly ending: AttemptEnding
}

const concludedOf = (conclusion: Conclusion): Concluded =>
  Match.valueTags(conclusion, {
    TryPassed: ({ steps, staged }): Concluded => ({ steps, errors: [], staged, ending: { _tag: 'Passed' } }),
    TryFailed: ({ steps, errors, staged, blamed }): Concluded => ({
      steps,
      errors,
      staged,
      ending: { _tag: 'Failed', failure: blamed },
    }),
    TryCancelled: ({ steps, errors }): Concluded => ({ steps, errors, staged: [], ending: { _tag: 'Interrupted' } }),
  })

const storageFailed = (digest: KeyDigest) => (): Effect.Effect<Option.Option<KeyDigest>> => Effect.succeedSome(digest)

const written = (store: CacheStoreShape) => (write: EntryWrite): Effect.Effect<Option.Option<KeyDigest>> =>
  store.write(write.digest, write.entry).pipe(
    Effect.map((answer) =>
      Match.valueTags(answer, {
        Written: () => Option.none<KeyDigest>(),
        ReadOnly: () => Option.some(write.digest),
        Oversized: () => Option.some(write.digest),
      })
    ),
    Effect.catch(storageFailed(write.digest)),
  )

const deleted = (store: CacheStoreShape) => (digest: KeyDigest): Effect.Effect<Option.Option<KeyDigest>> =>
  store.delete(digest).pipe(
    Effect.map((answer) =>
      Match.valueTags(answer, { Deleted: () => Option.none<KeyDigest>(), ReadOnly: () => Option.some(digest) })
    ),
    Effect.catch(storageFailed(digest)),
  )

/** Performs the settlement in decision order and answers the digests whose write or delete did not land. */
const performed = (
  store: CacheStoreShape,
  settled: SettleRecordingsDecision,
): Effect.Effect<ReadonlyArray<KeyDigest>> =>
  Match.valueTags(settled, {
    Untouched: () => Effect.succeed<ReadonlyArray<KeyDigest>>([]),
    Settled: ({ writes, deletes }) =>
      Effect.map(
        Effect.all([...Arr.map(writes, written(store)), ...Arr.map(deletes, deleted(store))]),
        Arr.getSomes,
      ),
  })

const settledWriteAt = (settled: SettleRecordingsDecision, position: number): Option.Option<CacheWrite> =>
  Match.valueTags(settled, {
    Untouched: () => Option.none<CacheWrite>(),
    Settled: ({ outcomes }) =>
      Option.map(Arr.findFirst(outcomes, (outcome) => outcome.stepIndex === position), (outcome) => outcome.write),
  })

const writeAt = (
  concluded: Concluded,
  settled: SettleRecordingsDecision,
  failed: ReadonlyArray<KeyDigest>,
  position: number,
): CacheWrite =>
  Option.exists(
      Arr.findFirst(concluded.staged, (staged) => staged.stepIndex === position),
      (staged) => Arr.contains(failed, staged.digest),
    )
    ? 'not-written'
    : Option.getOrElse(settledWriteAt(settled, position), (): CacheWrite => 'no-change')

const withWrite = (write: CacheWrite) => (step: StepRecord): StepRecord =>
  Match.value(step).pipe(
    Match.tag('ActStep', (act): StepRecord => ({ ...act, cache: { lookup: act.cache.lookup, write } })),
    Match.tag('AssertStep', (judged): StepRecord => ({ ...judged, cache: { lookup: judged.cache.lookup, write } })),
    Match.tag('WaitForStep', (judged): StepRecord => ({ ...judged, cache: { lookup: judged.cache.lookup, write } })),
    Match.orElse(() => step),
  )

/**
 * Settles the try's staged recordings by design §9.5, writes the decided entries and evictions, and
 * records the attempt. A store failure marks the step `not-written` and never moves the status.
 */
export const settleAttempt = (request: SettleAttemptRequest): Effect.Effect<RanAttempt> => {
  const concluded = concludedOf(request.conclusion)
  const verdict = foldRunVerdict(new FoldRunVerdict({ steps: concluded.steps, runErrors: concluded.errors })).pipe(
    decided,
    runVerdictOf,
  )
  const settled = decided(
    settleRecordings(
      new SettleRecordings({
        mode: request.mode,
        ending: concluded.ending,
        steps: concluded.steps,
        staged: concluded.staged,
      }),
    ),
  )
  return Effect.map(performed(request.store, settled), (failed): RanAttempt => ({
    _tag: 'Ran',
    id: AttemptId.make(`attempt-${request.retry}`),
    retry: request.retry,
    status: verdict.status,
    steps: Arr.map(concluded.steps, (step, position) => withWrite(writeAt(concluded, settled, failed, position))(step)),
    errors: concluded.errors,
  }))
}

export interface EvidenceFailuresRequest {
  readonly attempt: RanAttempt
  readonly failures: ReadonlyArray<FailureRecord>
}

export const withEvidenceFailures = (request: EvidenceFailuresRequest): RanAttempt => {
  const errors = [...request.attempt.errors, ...request.failures]
  const verdict = foldRunVerdict(new FoldRunVerdict({ steps: request.attempt.steps, runErrors: errors })).pipe(
    decided,
    runVerdictOf,
  )
  return { ...request.attempt, status: verdict.status, errors }
}
