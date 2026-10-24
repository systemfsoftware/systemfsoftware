import type * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'

const EXIT_CODE: Runtime.errorExitCode = '~effect/Runtime/errorExitCode'
const LOGGED_BY_RUNTIME: Runtime.errorReported = '~effect/Runtime/errorReported'

/**
 * `init` refused and wrote nothing (requirements AC-1.4): the files it names already exist, or the suite root's
 * `package.json` cannot be merged into. The CLI has printed why, so the process exits 2 without a second report.
 */
export class InitRefused extends Schema.TaggedError<InitRefused>()('InitRefused', { message: Schema.String }) {
  override readonly [EXIT_CODE] = 2
  override readonly [LOGGED_BY_RUNTIME] = false
}

export class InstallFailed extends Schema.TaggedError<InstallFailed>()('InstallFailed', {
  message: Schema.String,
  exitCode: Schema.Int,
}) {}
