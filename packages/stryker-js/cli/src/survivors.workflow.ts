import { Workflow } from '@systemfsoftware/effect-cell-types'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Either from 'effect/Either'
import { pipe } from 'effect/Function'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import {
  extractSurvivors,
  type HashContent,
  type ResolveAbsolutePath,
  sourceContentHash,
  stripSurvivorsKeys,
  structuralHash,
  SURVIVORS_RUN_FIRST_REMEDIATION,
  wasProducedBySurvivorsRun,
} from './survivors.kernel.js'

export const SurvivorsAdmissionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/stryker-js-cli/SurvivorsAdmission',
)
export type SurvivorsAdmissionTypeId = typeof SurvivorsAdmissionTypeId

/** The rejection reasons a survivors run fails with (R6: exit 2). */
export type SurvivorsRejectReason = 'no-report' | 'mismatch'

/**
 * The internal mutant shape the admission carries: the same five fields the
 * kernel's `reportMutantToMutant` produces (0-based positions, absolute file
 * name). The schema mirrors that shape so the decision variant is typed by
 * construction; the optional `Mutant` fields are absent and stay absent.
 */
const MutantSchema = S.Struct({
  id: S.String,
  fileName: S.String,
  mutatorName: S.String,
  replacement: S.String,
  location: S.Struct({
    start: S.Struct({ line: S.Number, column: S.Number }),
    end: S.Struct({ line: S.Number, column: S.Number }),
  }),
})

/**
 * The admission decision: the survivors to re-test. The run's mutant set is
 * exactly the prior report's survivor set.
 */
export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {
  survivors: S.Array(MutantSchema),
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

/**
 * The admission decision for a report with zero survivors to re-test: the
 * run exits 0 through the success path without starting the pipeline.
 */
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

/** The decision channel of the admission workflow. */
export const SurvivorsAdmission = S.Union(Admitted, NoSurvivors)
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>

/**
 * The typed failure a rejected survivors run fails with. The cli layer maps
 * it to exit 2 (`SURVIVORS_REJECT_EXIT_CLASS`) and surfaces `remediation` in
 * the error envelope (U6); the message carries the same text, so the
 * envelope names the full run to do first even where only the failure text
 * is shown.
 */
export class SurvivorsRejection extends S.TaggedError<SurvivorsRejection>()('SurvivorsRejection', {
  reason: S.Literal('no-report', 'mismatch'),
  remediation: S.String,
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

/**
 * The command of the admission workflow. The two capabilities keep the
 * kernel this workflow calls runtime-module-free: the executor wires the
 * sha256 digest and the relative-to-absolute path resolver.
 */
export interface AdmitSurvivorsRunInput {
  /**
   * The prior run's mutation report. `undefined` when no usable report
   * exists — the run cannot be admitted without one ('no-report').
   */
  readonly priorReport: schema.MutationTestResult | undefined
  /** The current run's resolved options (defaults + config file + CLI). */
  readonly currentConfig: Record<string, unknown>
  /** The current CLI/framework version (`strykerVersion`). */
  readonly frameworkVersion: string
  /**
   * Per-file content hashes of the current source, keyed by the prior
   * report's relative file keys. The prior side is hashed from the sources
   * the report embeds, so an editor save that shifts line ranges — which
   * would silently re-test a different mutant than the one that survived —
   * is caught here.
   */
  readonly sourceContentHashes: Readonly<Record<string, string>>
  /** The sha256 digest capability the admission hash needs. */
  readonly hashContent: HashContent
  /** The relative-to-absolute path capability the mutant conversion needs. */
  readonly resolveAbsolutePath: ResolveAbsolutePath
}

const NO_REPORT_DETAIL = 'No prior mutation report found — a --survivors run needs the report of a previous run.'
const SURVIVORS_RUN_SOURCE_DETAIL =
  'The prior mutation report was itself produced by a --survivors run, so it is not a valid input for another one.'
const MISMATCH_DETAIL =
  'The prior mutation report does not match the current run (resolved options, framework version, or source content differ).'

function reject(reason: SurvivorsRejectReason, detail: string): SurvivorsRejection {
  return new SurvivorsRejection({
    reason,
    remediation: `${detail} ${SURVIVORS_RUN_FIRST_REMEDIATION}`,
  })
}

/**
 * The per-file source hashes of the sources the prior report embeds.
 */
function priorSourceHashes(
  priorReport: schema.MutationTestResult,
  hashContent: HashContent,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, hashContent),
    ]),
  )
}

/**
 * Whether the admission hashes agree: the prior report's embedded resolved
 * options, framework version and source content against the current run's.
 */
function hashesMatch(
  priorReport: schema.MutationTestResult,
  input: AdmitSurvivorsRunInput,
): boolean {
  const priorHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(priorReport.config),
    frameworkVersion: priorReport.framework?.version,
    sourceContentHashes: priorSourceHashes(priorReport, input.hashContent),
  }, input.hashContent)
  const currentHash = structuralHash({
    resolvedOptions: stripSurvivorsKeys(input.currentConfig),
    frameworkVersion: input.frameworkVersion,
    sourceContentHashes: input.sourceContentHashes,
  }, input.hashContent)
  return priorHash === currentHash
}

/**
 * Admits a survivors-only run against the prior mutation report. The prior
 * report must be a full run's report (KTD7), must describe the current run
 * (KTD6), and must actually contain survivors; anything else is a rejection
 * whose remediation names the full run to do first. On admission the run's
 * mutant set is exactly the prior report's survivor set.
 */
export const admitSurvivorsRun = Workflow.make(
  (input: AdmitSurvivorsRunInput): Either.Either<SurvivorsAdmission, SurvivorsRejection> =>
    pipe(
      Option.fromNullable(input.priorReport),
      Either.fromOption(() => reject('no-report', NO_REPORT_DETAIL)),
      Either.flatMap((priorReport) =>
        Either.map(
          Either.filterOrLeft(
            Either.right(priorReport),
            (report) => !wasProducedBySurvivorsRun(report),
            () => reject('mismatch', SURVIVORS_RUN_SOURCE_DETAIL),
          ),
          (report) => ({ report, survivors: extractSurvivors(report, input.resolveAbsolutePath) }),
        )
      ),
      Either.flatMap(
        ({ report, survivors }): Either.Either<SurvivorsAdmission, SurvivorsRejection> =>
          survivors.length === 0
            ? Either.right(new NoSurvivors())
            : Either.map(
              Either.filterOrLeft(
                Either.right(report),
                (candidate) => hashesMatch(candidate, input),
                () => reject('mismatch', MISMATCH_DETAIL),
              ),
              () => new Admitted({ survivors }),
            ),
      ),
    ),
)
