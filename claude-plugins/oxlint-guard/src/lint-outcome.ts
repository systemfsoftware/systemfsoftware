import { err, ok, type Result } from './result.ts'

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

export class Clean {
  readonly _tag: 'Clean' = 'Clean'
}

export class BenignNoFiles {
  readonly _tag: 'BenignNoFiles' = 'BenignNoFiles'
}

export class IgnoredPath {
  readonly _tag: 'IgnoredPath' = 'IgnoredPath'
}

export class RetryWithoutTypeAware {
  readonly _tag: 'RetryWithoutTypeAware' = 'RetryWithoutTypeAware'
}

export type LintOutcome = Clean | BenignNoFiles | IgnoredPath | RetryWithoutTypeAware

export class LintViolation {
  readonly _tag: 'LintViolation' = 'LintViolation'
  readonly output: string
  constructor(args: { readonly output: string }) {
    this.output = args.output
  }
}

export type LintResult = Result<LintOutcome, LintViolation>

// The arm order is load-bearing: exit 0, then no-files, then outside-root, then
// tsgolint (only when a retry is still possible), then a plain violation.
export const classifyLintResult = (command: ClassifyCommand): Result<LintOutcome, LintViolation> => {
  if (command.result.exitCode === 0) {
    return ok(new Clean())
  }
  if (NO_FILES_FOUND.test(combinedOutput(command.result))) {
    return ok(new BenignNoFiles())
  }
  if (PATH_OUTSIDE_ROOT.test(combinedOutput(command.result))) {
    return ok(new IgnoredPath())
  }
  if (command.canRetry && TSGOLINT_MISSING.test(combinedOutput(command.result))) {
    return ok(new RetryWithoutTypeAware())
  }
  return err(new LintViolation({ output: command.result.stderr !== '' ? command.result.stderr : command.result.stdout }))
}
