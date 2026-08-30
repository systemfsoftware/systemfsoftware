/**
 * Survivors — the survivors-admission capability.
 *
 * The prior-report decoding, source hashing, mutant conversion, and admission
 * pipeline for --survivors runs. Pure admission decision lives in
 * Survivors.workflow.ts.
 */
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { PriorReportDocument as PriorReportDocumentSchema } from './Survivors.workflow.js'
export type PriorReportDocument = S.Schema.Type<typeof PriorReportDocumentSchema>
export type PriorReportMutant = PriorReportDocument['files'][string]['mutants'][number]
import {
  ConfigFileUnreadableError,
  readConfig,
  strykerVersion,
  toRelativeNormalizedFileName,
} from '@systemfsoftware/stryker-js-platform-node'
import type {
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ResolvedMode,
} from '@systemfsoftware/stryker-js-platform-node'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { schema } from '@systemfsoftware/stryker-js/Mutant'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { emitNullScoreVerdict } from './Output.js'
import type { RunEventStream } from './Output.js'
import type { StrykerRun } from './StrykerRun.js'
import {
  admitSurvivorsRun,
  AdmitSurvivorsRunCommand,
  PriorReportFacts,
  type SurvivorsAdmission,
  SurvivorsRejection,
} from './Survivors.workflow.js'

export const DEFAULT_SURVIVORS_PRIOR_REPORT = 'reports/mutation-report.json'

/**
 * The remediation every rejection carries (R10): name the full run to do
 * first, never the survivors run itself.
 */
export const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'

/**
 * The survivors-run bookkeeping keys carried in the resolved options. They
 * are run mechanics, not configuration: a survivors run adds them, so without
 * stripping them the current run's hash would differ from the prior full
 * run's hash for the very same configuration. Their presence in a report's
 * embedded config is also the marker that the report was produced by a
 * survivors run (KTD7).
 */
export const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

/**
 * The mutant shape the admission carries, named once because both the decision's
 * `Admitted` payload and the command's precomputed survivor list are the same shape.
 */

/**
 * The prior report as a document, decoded at the boundary. Module-internal: consumers
 * get the decode function, not the schema, so the report's wire shape is not a
 * surface commitment and the codec has exactly one caller.
 *
 * `status` is a bare string rather than the closed status set on purpose: the decide only
 * compares it to `'Survived'`, so a report written by a newer engine that added a status
 * must not be refused for carrying one.
 */

/**
 * Decodes a prior report read from disk. Pure, so it runs in the decode phase, whose
 * `Left` is fatal by construction — it reaches the derived error channel and no write
 * runs. A malformed report therefore never reaches the decider, and nothing here casts
 * a third-party report type.
 */
export const decodePriorReport: (raw: unknown) => Result.Result<PriorReportDocument, S.SchemaError> = S
  .decodeUnknownResult(PriorReportDocumentSchema)

const { entries: objectEntries, fromEntries: objectFromEntries } = Object

/**
 * The sha256-hex digest capability the admission comparison needs. Supplied by
 * the caller so this kernel stays runtime-module-free; the shell wires
 * `bytesToHex(sha256(utf8ToBytes(content)))`.
 */
export type HashContent = (content: string) => string

/**
 * Thin by design: the digest is the caller's capability, and naming the call
 * keeps every hashing site in the admission path reading the same way.
 */
export function sourceContentHash(content: string, hash: HashContent): string {
  return hash(content)
}

/**
 * The per-file source hashes of the sources a prior report embeds.
 *
 * The current run's side of the comparison is gathered by the shell from disk;
 * this is the recorded side, read back out of the report.
 */
export function priorSourceHashes(
  priorReport: PriorReportDocument,
  hashContent: HashContent,
): Record<string, string> {
  return objectFromEntries(
    objectEntries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, hashContent),
    ]),
  )
}

/**
 * The relative-to-absolute path capability the mutant conversion needs.
 * Supplied by the caller so this kernel stays runtime-module-free; the shell
 * wires `path.resolve`.
 */
export type ResolveAbsolutePath = (file: string) => string

/**
 * The survivor matching key (R10/R11): the same identifying key the
 * incremental differ uses — relative file name, location, mutator name and
 * replacement — so a per-mutant entry taken from the verdict envelope (U4),
 * which carries exactly these fields, is sufficient input to reconstruct a
 * survivor with no access to the report file.
 */
export function survivorIdentifyingKey(
  input: {
    readonly file: string
    readonly location: schema.Location
    readonly mutatorName: string
    readonly replacement: string | undefined
  },
  basePath: string,
): string {
  const {
    file,
    location: { start, end },
    mutatorName,
    replacement,
  } = input
  return `${
    toRelativeNormalizedFileName(file, basePath)
  }@${start.line}:${start.column}-${end.line}:${end.column}\n${mutatorName}: ${replacement}`
}

/**
 * Converts a report mutant (1-based schema location) into the internal mutant
 * shape a run consumes (0-based positions, absolute file name) — the exact
 * inverse of `objectUtils.toSchemaLocation` and the same shift the
 * incremental report reader applies (`project-reader.ts`). Mutants without a
 * replacement fall back to their mutator name, the same convention the
 * incremental differ uses.
 */
export function reportMutantToMutant(
  file: string,
  mutant: PriorReportMutant,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant {
  return Mutant.make({
    id: mutant.id,
    fileName: resolveAbsolutePath(file),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement ?? mutant.mutatorName,
    location: {
      start: {
        line: mutant.location.start.line - 1,
        column: mutant.location.start.column - 1,
      },
      end: {
        line: mutant.location.end.line - 1,
        column: mutant.location.end.column - 1,
      },
    },
  })
}

/**
 * The survivors of the prior report: exactly the mutants whose status is
 * `Survived`, converted to the internal mutant shape so a run can re-test
 * them.
 */
export function extractSurvivors(
  priorReport: PriorReportDocument,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant[] {
  const survivors: Mutant[] = []
  for (const [file, fileResult] of objectEntries(priorReport.files)) {
    for (const mutant of fileResult.mutants) {
      if (mutant.status === 'Survived') {
        survivors.push(reportMutantToMutant(file, mutant, resolveAbsolutePath))
      }
    }
  }
  return survivors
}

/**
 * The survivor spans as `file:startLine:startCol-endLine:endCol` mutate
 * ranges: the report's 1-based lines with the internal 0-based columns,
 * relative file names, deduplicated in first-seen order.
 */
export function survivorMutateSpans(survivors: readonly Mutant[], basePath: string): string[] {
  const spans: string[] = []
  const seen = new Set<string>()
  for (const survivor of survivors) {
    const file = toRelativeNormalizedFileName(survivor.fileName, basePath)
    const { start, end } = survivor.location
    const span = `${file}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
    if (!seen.has(span)) {
      seen.add(span)
      spans.push(span)
    }
  }
  return spans
}

/** The exit class a rejected survivors run exits with (R6: exit 2). */
export const SURVIVORS_REJECT_EXIT_CLASS: ExitClass = 'ConfigError'
const hashContent: HashContent = (content) => bytesToHex(sha256(utf8ToBytes(content)))

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
    readonly priorReportRaw: unknown
    readonly priorReportFound: boolean
    readonly priorReportPath: string
    readonly sourceContentHashes: Readonly<Record<string, string>>
    readonly resolveAbsolutePath: ResolveAbsolutePath
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
}

/** The run context the admission's write phase dispatches on, threaded beside the decision. */
interface AdmissionRunContext {
  readonly resolvedOptions: StrykerOptions
  readonly priorReportPath: string
  readonly pathService: Path.Path
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
  services: Context.Context<FileSystem.FileSystem | Path.Path>,
): Cell.WriteDone<AdmissionPhases> =>
  pipe(
    Cell.read<AdmissionPhases>((cliOptions) =>
      Effect.provideContext(
        Effect.flatMap(Path.Path, (pathService) =>
          resolveSurvivorsRunOptions(cliOptions, basePath).pipe(
            Effect.flatMap((resolvedOptions) => {
              const priorReportPath = priorReportPathOf(resolvedOptions)
              const resolveAbsolutePath: ResolveAbsolutePath = (file) => pathService.resolve(file)
              return Effect.flatMap(readPriorReport(priorReportPath), (read) =>
                Effect.flatMap(currentSourceHashesFor(priorReportFileKeys(read.raw)), (sourceContentHashes) =>
                  Ref.set(runContext, { resolvedOptions, priorReportPath, pathService }).pipe(
                    Effect.as({
                      resolvedOptions,
                      priorReportRaw: read.raw,
                      priorReportFound: read.found,
                      priorReportPath,
                      sourceContentHashes,
                      resolveAbsolutePath,
                    }),
                  )))
            }),
          )),
        services,
      )
    ),
    Cell.decode<AdmissionPhases>(
      ({ resolvedOptions, priorReportRaw, priorReportFound, sourceContentHashes, resolveAbsolutePath }) => {
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
      },
    ),
    Cell.decide<AdmissionPhases>(admitSurvivorsRun),
    Cell.encode<AdmissionPhases>((outcome) => outcome),
    Cell.write<AdmissionPhases>((outcome) =>
      Effect.flatMap(Ref.get(runContext), (context) => {
        if (context === undefined) {
          return Effect.die('the survivors admission read must run before its write')
        }
        const { resolvedOptions, priorReportPath, pathService } = context
        return Result.match(outcome, {
          onSuccess: (decision) =>
            Match.value(decision).pipe(
              Match.tag(
                'NoSurvivors',
                () =>
                  emitNullScoreVerdict(
                    stream,
                    mode,
                    resolvedOptions.thresholds,
                    resolvedOptions,
                    basePath,
                    pathService,
                  ),
              ),
              Match.tag('Admitted', (admitted) => {
                const admittedMutants = admitted.survivors.map((s) => Mutant.make(s))
                const restricted: SurvivorsRunOptions = {
                  ...resolvedOptions,
                  survivors: admittedMutants,
                  mutate: survivorMutateSpans(admittedMutants, basePath),
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
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
    const admissionContext = yield* Ref.make<AdmissionRunContext | undefined>(undefined)
    return yield* Cell.apply(
      survivorsAdmissionDescription(runMutationTest, stream, mode, admissionContext, basePath, services),
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
  return readConfig(cliOptions, basePath)
}

function priorReportPathOf(resolved: StrykerOptions): string {
  const configured = resolved['survivorsPriorReport']
  if (typeof configured === 'string') {
    return configured
  }
  return DEFAULT_SURVIVORS_PRIOR_REPORT
}

interface PriorReportRead {
  readonly found: boolean
  readonly raw: unknown
}

function readPriorReport(
  priorReportPath: string,
): Effect.Effect<PriorReportRead, ConfigFileUnreadableError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    // A prior report is optional: absent means "no baseline", which is a found:false read
    // rather than a failure. Any other platform reason is a real unreadable file.
    return yield* fs.readFileString(priorReportPath).pipe(
      Effect.map((text): PriorReportRead => ({
        found: true,
        // The file is a report document when it parses, and its own raw text when it does
        // not — the caller's key walk tolerates both, so a malformed baseline degrades to
        // "no keys" instead of failing the run.
        raw: Result.match(S.decodeResult(S.fromJsonString(S.Unknown))(text), {
          onFailure: () => text,
          onSuccess: (value) => value,
        }),
      })),
      Effect.catchTag('PlatformError', (cause) =>
        Match.value(cause.reason).pipe(
          Match.tag('NotFound', () => Effect.succeed<PriorReportRead>({ found: false, raw: undefined })),
          Match.orElse(() => Effect.fail(ConfigFileUnreadableError.make({ file: priorReportPath, cause }))),
        )),
    )
  })
}

function priorReportFileKeys(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  if (!('files' in raw)) return []
  const files = raw.files
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return []
  return Object.keys(files)
}

function readSourceFile(file: string): Effect.Effect<string, ConfigFileUnreadableError, FileSystem.FileSystem> {
  return Effect.flatMap(
    FileSystem.FileSystem,
    (fs) => fs.readFileString(file).pipe(Effect.mapError((cause) => ConfigFileUnreadableError.make({ file, cause }))),
  )
}

function currentSourceHashesFor(
  files: readonly string[],
): Effect.Effect<Record<string, string>, ConfigFileUnreadableError, FileSystem.FileSystem> {
  return Effect.map(
    Effect.forEach(
      files,
      (file) => Effect.map(readSourceFile(file), (content) => [file, sourceContentHash(content, hashContent)] as const),
      { concurrency: 24 },
    ),
    (pairs) => Object.fromEntries(pairs),
  )
}

type SurvivorsRunOptions = PartialStrykerOptions & {
  readonly survivors?: readonly Mutant[]
  readonly survivorsPriorReport?: string
}
