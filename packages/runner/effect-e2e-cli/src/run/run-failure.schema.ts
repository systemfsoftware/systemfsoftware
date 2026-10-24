import type * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'

import { ConfigInvalid } from '@systemfsoftware/effect-e2e'

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

/**
 * The suite config the runner refused (requirements AC-12.4): the run's own watcher recorded the refusal while
 * Vitest closed, so the process exits 2 without reading a report the run never wrote.
 */
export class RunConfigRefused extends Schema.TaggedError<RunConfigRefused>()('RunConfigRefused', {
  refusal: ConfigInvalid,
}) {
  override readonly [EXIT_CODE] = 2
  override readonly [LOGGED_BY_RUNTIME] = false

  override get message(): string {
    return this.refusal.message
  }
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
