import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { Cell } from '@systemfsoftware/effect-cell-types'
import {
  type ConfigFileInvalidError,
  type ConfigFileNotFoundError,
  ConfigFileUnreadableError,
  readConfig,
  strykerVersion,
  toRelativeNormalizedFileName,
} from '@systemfsoftware/stryker-js-engine'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { Module } from '@systemfsoftware/stryker-js/Module'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { schema } from '@systemfsoftware/stryker-js/Mutant'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { PriorReportDocument as PriorReportDocumentSchema } from './admit-survivors-run.workflow.js'
export type PriorReportDocument = S.Schema.Type<typeof PriorReportDocumentSchema>
export type PriorReportMutant = PriorReportDocument['files'][string]['mutants'][number]
import {
  admitSurvivorsRun,
  AdmitSurvivorsRunCommand,
  PriorReportFacts,
  type SurvivorsAdmission,
  SurvivorsRejection,
} from './admit-survivors-run.workflow.js'

export const DEFAULT_SURVIVORS_PRIOR_REPORT = 'reports/mutation-report.json'

export const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'

export const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const

export const decodePriorReport: (raw: unknown) => Result.Result<PriorReportDocument, S.SchemaError> = S
  .decodeUnknownResult(PriorReportDocumentSchema)

const { entries: objectEntries, fromEntries: objectFromEntries } = Object

const EMPTY_CONFIG: Record<string, unknown> = {}

export type HashContent = (content: string) => string

export function sourceContentHash(content: string, hash: HashContent): string {
  return hash(content)
}

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

export type ResolveAbsolutePath = (file: string) => string

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

export function extractSurvivors(
  priorReport: PriorReportDocument,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant[] {
  return objectEntries(priorReport.files).flatMap(([file, fileResult]) =>
    fileResult.mutants
      .filter((mutant) => mutant.status === 'Survived')
      .map((mutant) => reportMutantToMutant(file, mutant, resolveAbsolutePath))
  )
}

export function survivorMutateSpans(survivors: readonly Mutant[], basePath: string): string[] {
  return [
    ...new Set(
      survivors.map((survivor) =>
        `${toRelativeNormalizedFileName(survivor.fileName, basePath)}:${
          survivor.location.start.line + 1
        }:${survivor.location.start.column}-${survivor.location.end.line + 1}:${survivor.location.end.column}`
      ),
    ),
  ]
}

export const SURVIVORS_REJECT_EXIT_CLASS: ExitClass = 'ConfigError'
const hashContent: HashContent = (content) => bytesToHex(sha256(utf8ToBytes(content)))

export const survivorsAdmissionCell = (basePath: string) =>
  Cell.layer({
    read: (cliOptions: PartialStrykerOptions) =>
      Effect.gen(function*() {
        const pathService = yield* Path.Path
        const resolvedOptions = yield* resolveSurvivorsRunOptions(cliOptions, basePath)
        const priorReportPath = priorReportPathOf(resolvedOptions)
        const resolveAbsolutePath: ResolveAbsolutePath = (file) => pathService.resolve(file)
        const read = yield* readPriorReport(priorReportPath)
        const sourceContentHashes = yield* currentSourceHashesFor(priorReportFileKeys(read.raw))
        return {
          resolvedOptions,
          priorReportRaw: read.raw,
          priorReportFound: read.found,
          priorReportPath,
          sourceContentHashes,
          resolveAbsolutePath,
        }
      }),
    decode: ({ resolvedOptions, priorReportRaw, priorReportFound, sourceContentHashes, resolveAbsolutePath }) => {
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
            config: Option.getOrElse(Option.fromNullishOr(document.config), () => EMPTY_CONFIG),
            frameworkVersion: Option.getOrUndefined(
              Option.flatMap(
                Option.fromNullishOr(document.framework),
                (framework) => Option.fromNullishOr(framework.version),
              ),
            ),
          }),
          currentConfig: resolvedOptions,
          frameworkVersion: strykerVersion,
          sourceContentHashes,
          priorSourceHashes: priorSourceHashes(document, hashContent),
          priorSurvivors: extractSurvivors(document, resolveAbsolutePath),
        }))
    },
    decide: admitSurvivorsRun,
    encode: (outcome: Result.Result<SurvivorsAdmission, SurvivorsRejection>) => outcome,
    write: (outcome, raw) =>
      Result.match(outcome, {
        onSuccess: (admission) =>
          Effect.succeed({
            admission,
            resolvedOptions: raw.resolvedOptions,
            priorReportPath: raw.priorReportPath,
          }),
        onFailure: Effect.fail,
      }),
  })

export function runSurvivorsAdmission(
  cliOptions: PartialStrykerOptions,
  basePath: string,
): Effect.Effect<
  {
    readonly admission: SurvivorsAdmission
    readonly resolvedOptions: StrykerOptions
    readonly priorReportPath: string
  },
  S.SchemaError | SurvivorsRejection | ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path | Module
> {
  return survivorsAdmissionCell(basePath).run(cliOptions)
}

function resolveSurvivorsRunOptions(
  cliOptions: PartialStrykerOptions,
  basePath: string,
): Effect.Effect<
  StrykerOptions,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Module | Path.Path
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
    return yield* fs.readFileString(priorReportPath).pipe(
      Effect.map((text): PriorReportRead => ({
        found: true,
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
  return Option.getOrElse(
    Option.map(
      Option.flatMap(
        Option.liftPredicate(raw, Match.record),
        (document) => Option.liftPredicate(document['files'], Match.record),
      ),
      (files) => Object.keys(files),
    ),
    () => [],
  )
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
