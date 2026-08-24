import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { readConfig } from '@systemfsoftware/stryker-js-mutation-run/config/config-resolution'
import { forkCoreSchema } from '@systemfsoftware/stryker-js-mutation-run/config/fork-schema'
import type {
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
} from '@systemfsoftware/stryker-js-mutation-run/errors'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'
import type { Mutant, PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { noopLogger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { emitNullScoreVerdict } from './cli-machine-output.js'
import type { StrykerRun } from './cli-ports.js'
import type { RunEventStream } from './run-event-stream.js'
import {
  admitSurvivorsRun,
  AdmitSurvivorsRunCommand,
  PriorReportFacts,
  type SurvivorsAdmission,
  SurvivorsRejection,
} from './survivors-admission.workflow.js'
import { DEFAULT_SURVIVORS_PRIOR_REPORT } from './survivors-bookkeeping.js'
import { type HashContent, priorSourceHashes, sourceContentHash } from './survivors-hashing.kernel.js'
import { extractSurvivors, type ResolveAbsolutePath, survivorMutateSpans } from './survivors-mutants.kernel.js'
import { decodePriorReport } from './survivors-report.kernel.js'
const hashContent: HashContent = (content) => createHash('sha256').update(content, 'utf-8').digest('hex')

const resolveAbsolutePath: ResolveAbsolutePath = (file) => resolvePath(file)

/**
 * The phases of the survivors admission, in one bag so the chain's order is
 * carried by types: resolve and read (config, prior report, source hashes),
 * package the workflow input, call the admission workflow, shape nothing, and
 * dispatch the outcome to the write. A rejection is the decide phase's
 * `Left` — an outcome, not a fault — so it travels through `encode` into the
 * write, which fails the run with it.
 */
interface AdmissionPhases extends Cell.Phases {
  readonly command: PartialStrykerOptions
  readonly raw: {
    readonly resolvedOptions: StrykerOptions
    /**
     * The prior report exactly as it came off disk, undecoded. `undefined` means no
     * report was there to read; a value that is present but malformed is the decode
     * phase's problem, not the read's, so nothing validates it here.
     */
    readonly priorReportRaw: unknown
    readonly priorReportFound: boolean
    readonly priorReportPath: string
    readonly sourceContentHashes: Readonly<Record<string, string>>
  }
  readonly decoded: AdmitSurvivorsRunCommand
  readonly decision: SurvivorsAdmission
  readonly decisionError: SurvivorsRejection
  readonly output: Result.Result<SurvivorsAdmission, SurvivorsRejection>
  readonly response: unknown
  /**
   * A prior report that is present but does not decode. Fatal by construction: a decode
   * `Left` reaches the derived error channel and no write runs, so a malformed report
   * stops the run instead of being classified as a mismatch by the decider.
   */
  readonly decodeError: S.SchemaError
  readonly readError: ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError
  readonly writeError: SurvivorsRejection
  readonly readContext: FileSystem.FileSystem | Path.Path
  readonly writeContext: never
}

/** The run context the admission's write phase dispatches on, threaded beside the decision. */
interface AdmissionRunContext {
  readonly resolvedOptions: StrykerOptions
  readonly priorReportPath: string
}

/**
 * The survivors admission, as a description whose phases chain by type and
 * read in the order they run. The read gathers the admission's whole input
 * product — resolved options, prior report and the current source hashes —
 * across its interior and stashes the shell context the write dispatches on
 * into the executor-owned `runContext` ref; `decode` packages exactly the
 * workflow input; `admitSurvivorsRun` is the decide phase; `encode` is the
 * identity because write receives the outcome as-is; the write reads the
 * stashed context back and dispatches the decision to the verdict/run,
 * failing the run with a rejection.
 */
const survivorsAdmissionDescription = (
  runMutationTest: StrykerRun,
  stream: RunEventStream,
  mode: ResolvedMode,
  runContext: Ref.Ref<AdmissionRunContext | undefined>,
  basePath: string,
): Cell.WriteDone<AdmissionPhases> =>
  pipe(
    Cell.read<AdmissionPhases>((cliOptions) =>
      resolveSurvivorsRunOptions(cliOptions, basePath).pipe(
        Effect.flatMap((resolvedOptions) => {
          const priorReportPath = priorReportPathOf(resolvedOptions)
          const read = readPriorReport(priorReportPath)
          return Ref.set(runContext, { resolvedOptions, priorReportPath }).pipe(
            Effect.as({
              resolvedOptions,
              priorReportRaw: read.raw,
              priorReportFound: read.found,
              priorReportPath,
              sourceContentHashes: currentSourceHashesFor(priorReportFileKeys(read.raw)),
            }),
          )
        }),
      )
    ),
    Cell.decode<AdmissionPhases>(({ resolvedOptions, priorReportRaw, priorReportFound, sourceContentHashes }) => {
      if (!priorReportFound) {
        return Result.succeed(
          AdmitSurvivorsRunCommand.make({
            priorReport: undefined,
            currentConfig: resolvedOptions,
            frameworkVersion: strykerVersion,
            sourceContentHashes,
            priorSourceHashes: {},
            priorSurvivors: [],
          }),
        )
      }
      return Result.map(decodePriorReport(priorReportRaw), (document) =>
        AdmitSurvivorsRunCommand.make({
          priorReport: PriorReportFacts.make({
            config: document.config ?? {},
            frameworkVersion: document.framework?.version,
          }),
          currentConfig: resolvedOptions,
          frameworkVersion: strykerVersion,
          sourceContentHashes,
          priorSourceHashes: priorSourceHashes(document, hashContent),
          priorSurvivors: extractSurvivors(document, resolveAbsolutePath),
        }))
    }),
    Cell.decide<AdmissionPhases>(admitSurvivorsRun),
    Cell.encode<AdmissionPhases>((outcome) => outcome),
    Cell.write<AdmissionPhases>((outcome) =>
      Effect.flatMap(Ref.get(runContext), (context) => {
        if (context === undefined) {
          return Effect.die('the survivors admission read must run before its write')
        }
        const { resolvedOptions, priorReportPath } = context
        return Result.match(outcome, {
          onSuccess: (decision) =>
            Match.value(decision).pipe(
              Match.tag(
                'NoSurvivors',
                () =>
                  Effect.sync(() =>
                    emitNullScoreVerdict(stream, mode, resolvedOptions.thresholds, resolvedOptions, basePath)
                  ),
              ),
              Match.tag('Admitted', (admitted) => {
                const restricted: SurvivorsRunOptions = {
                  ...resolvedOptions,
                  survivors: admitted.survivors,
                  mutate: survivorMutateSpans(admitted.survivors, basePath),
                  survivorsPriorReport: priorReportPath,
                  incremental: false,
                }
                return runMutationTest(restricted).pipe(Effect.orDie)
              }),
              Match.orElse(() => Effect.die('unreachable admission decision variant')),
            ),
          onFailure: (rejection) => Effect.fail(rejection),
        })
      })
    ),
  )

/**
 * The `--survivors` request: re-test exactly the prior report's survivor set.
 * The survivors flag was parsed as a boolean; the admission decides between
 * running the survivors and the plain pipeline. The chain's order is carried by
 * the description's phase types; the run's resolved context cell is created
 * here, beside the description it feeds.
 *
 * Two failures reach the caller, and they are not the same thing. A rejection is the
 * decision's own outcome — the run was inspected and refused. A `SchemaError` is a prior
 * report that was present and did not decode, which stops the chain before any decision
 * is made; it is in this signature because the phase types put it there, not because the
 * admission chose it.
 */
export function runSurvivorsAdmission(
  runMutationTest: StrykerRun,
  stream: RunEventStream,
  mode: ResolvedMode,
  cliOptions: PartialStrykerOptions,
  basePath: string,
): Effect.Effect<
  unknown,
  S.SchemaError | SurvivorsRejection | ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const admissionContext = yield* Ref.make<AdmissionRunContext | undefined>(undefined)
    return yield* Cell.apply(
      survivorsAdmissionDescription(runMutationTest, stream, mode, admissionContext, basePath),
      cliOptions,
    )
  })
}

function resolveSurvivorsRunOptions(
  cliOptions: PartialStrykerOptions,
  basePath: string,
): Effect.Effect<
  StrykerOptions,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return readConfig(cliOptions, noopLogger, forkCoreSchema, basePath)
}

function priorReportPathOf(resolved: StrykerOptions): string {
  const configured = resolved['survivorsPriorReport']
  return typeof configured === 'string' ? configured : DEFAULT_SURVIVORS_PRIOR_REPORT
}

interface PriorReportRead {
  readonly found: boolean
  readonly raw: unknown
}

function readPriorReport(priorReportPath: string): PriorReportRead {
  let text: string
  try {
    text = readFileSync(priorReportPath, 'utf-8')
  } catch {
    return { found: false, raw: undefined }
  }
  try {
    return { found: true, raw: JSON.parse(text) }
  } catch {
    return { found: true, raw: text }
  }
}

function priorReportFileKeys(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  if (!('files' in raw)) return []
  const files = raw.files
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return []
  return Object.keys(files)
}

function readSourceFile(file: string): string {
  try {
    return readFileSync(file, 'utf-8')
  } catch {
    return ''
  }
}

function currentSourceHashesFor(files: readonly string[]): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const file of files) {
    hashes[file] = sourceContentHash(readSourceFile(file), hashContent)
  }
  return hashes
}

type SurvivorsRunOptions = PartialStrykerOptions & {
  readonly survivors?: readonly Mutant[]
  readonly survivorsPriorReport?: string
}
