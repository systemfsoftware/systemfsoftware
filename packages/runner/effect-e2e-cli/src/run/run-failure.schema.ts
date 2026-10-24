import type * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'

const EXIT_CODE: Runtime.errorExitCode = '~effect/Runtime/errorExitCode'
const LOGGED_BY_RUNTIME: Runtime.errorReported = '~effect/Runtime/errorReported'

/**
 * `run` refused before it started Vitest: no suite root at or above the working directory, or flags that cannot
 * hold together. The CLI has printed why, so the process exits 2 without a second report.
 */
export class RunRefused extends Schema.TaggedError<RunRefused>()('RunRefused', {
  message: Schema.String,
}) {
  override readonly [EXIT_CODE] = 2
  override readonly [LOGGED_BY_RUNTIME] = false
}

export class RunConfigRefused extends Schema.TaggedError<RunConfigRefused>()('RunConfigRefused', {
  message: Schema.String,
}) {
  override readonly [EXIT_CODE] = 2
  override readonly [LOGGED_BY_RUNTIME] = false
}

/** The run could not start or produced no report: a Vitest config or collection error (requirements FR-5). */
export class RunFailed extends Schema.TaggedError<RunFailed>()('RunFailed', {
  message: Schema.String,
}) {
  override readonly [EXIT_CODE] = 2
  override readonly [LOGGED_BY_RUNTIME] = false
}

export class RunEnded extends Schema.TaggedError<RunEnded>()('RunEnded', {
  status: Schema.String,
  exitCode: Schema.Int,
}) {
  override readonly [LOGGED_BY_RUNTIME] = false

  override get [EXIT_CODE](): number {
    return this.exitCode
  }

  override get message(): string {
    return `the run ended ${this.status} (exit ${String(this.exitCode)})`
  }
}
