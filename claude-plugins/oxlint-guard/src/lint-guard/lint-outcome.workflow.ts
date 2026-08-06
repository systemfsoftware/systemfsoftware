import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

export interface ProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ClassifyCommand {
  readonly result: ProcessResult
  readonly canRetry: boolean
}

const NO_FILES_FOUND = /No files found to lint/i
const PATH_OUTSIDE_ROOT = /path is expected to be under the root/i
const TSGOLINT_MISSING = /tsgolint|oxlint-tsgolint/i

const combinedOutput = (result: ProcessResult): string => result.stdout + '\n' + result.stderr

const stderrOrStdout = (result: ProcessResult): string => (result.stderr !== '' ? result.stderr : result.stdout)

const LintOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/LintOutcome')
type LintOutcomeTypeId = typeof LintOutcomeTypeId

export class Clean extends S.TaggedClass<Clean>()('Clean', {}) {
  readonly [LintOutcomeTypeId]: LintOutcomeTypeId = LintOutcomeTypeId
}

export class BenignNoFiles extends S.TaggedClass<BenignNoFiles>()('BenignNoFiles', {}) {
  readonly [LintOutcomeTypeId]: LintOutcomeTypeId = LintOutcomeTypeId
}

export class IgnoredPath extends S.TaggedClass<IgnoredPath>()('IgnoredPath', {}) {
  readonly [LintOutcomeTypeId]: LintOutcomeTypeId = LintOutcomeTypeId
}

export class RetryWithoutTypeAware extends S.TaggedClass<RetryWithoutTypeAware>()('RetryWithoutTypeAware', {}) {
  readonly [LintOutcomeTypeId]: LintOutcomeTypeId = LintOutcomeTypeId
}

export const LintOutcome = S.Union(Clean, BenignNoFiles, IgnoredPath, RetryWithoutTypeAware)
export type LintOutcome = S.Schema.Type<typeof LintOutcome>

const LintViolationTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/LintViolation')
type LintViolationTypeId = typeof LintViolationTypeId

export class LintViolation extends S.TaggedError<LintViolation>()('LintViolation', {
  output: S.String,
}) {
  readonly [LintViolationTypeId]: LintViolationTypeId = LintViolationTypeId
}

export type LintResult = Either.Either<LintOutcome, LintViolation>

export const classifyLintResult = (command: ClassifyCommand): Either.Either<LintOutcome, LintViolation> =>
  Match.value(command).pipe(
    Match.when({ result: { exitCode: 0 } }, () => Either.right(new Clean())),
    Match.when(
      (command) => NO_FILES_FOUND.test(combinedOutput(command.result)),
      () => Either.right(new BenignNoFiles()),
    ),
    Match.when(
      (command) => PATH_OUTSIDE_ROOT.test(combinedOutput(command.result)),
      () => Either.right(new IgnoredPath()),
    ),
    Match.when(
      (command) => command.canRetry && TSGOLINT_MISSING.test(combinedOutput(command.result)),
      () => Either.right(new RetryWithoutTypeAware()),
    ),
    Match.orElse((command) => Either.left(new LintViolation({ output: stderrOrStdout(command.result) }))),
  )
