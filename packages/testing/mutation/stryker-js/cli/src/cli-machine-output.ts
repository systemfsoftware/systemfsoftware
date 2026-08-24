import { defaultOptions } from '@systemfsoftware/stryker-js-mutation-run/config/config-resolution'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import type { HelpRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'
import { buildVerdictEnvelope } from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as S from 'effect/Schema'
import * as CliError from 'effect/unstable/cli/CliError'
import { buildErrorEnvelope } from './cli-error-envelope.js'
import { failureValue } from './cli-failure-text.js'
import { readCapturedConsole } from './console-capture.js'
import type { RunEventStream } from './run-event-stream.js'
import { STREAM_SCHEMA_VERSION } from './stream-protocol.js'

/**
 * Machine mode emits the U4 verdict envelope for a run that produced no
 * mutants and no report file: a `--survivors` run with zero survivors (AE3)
 * or a successful `--dryRunOnly` run that ended before the mutation
 * pipeline. The envelope carries a null score and an empty mutant list and is
 * written as the terminal `verdict` line of the stdout stream (U6), carrying
 * the run id the stream header already opened with (KTD11 — never a fresh
 * id). Human mode prints nothing (the sink drops in human mode).
 */
export function emitNullScoreVerdict(
  stream: RunEventStream,
  mode: ResolvedMode,
  thresholds: schema.Thresholds,
  config: object,
  basePath: string,
): void {
  const report: schema.MutationTestResult = {
    schemaVersion: '1.0',
    files: {},
    thresholds,
    projectRoot: basePath,
    config,
    framework: { name: 'StrykerJS', version: strykerVersion },
  }
  const envelope = buildVerdictEnvelope(report, mode.mode, mode.signal, stream.runId, basePath)
  stream.sink({ kind: 'verdict', ...envelope })
}

/**
 * Emits the machine-mode output from the run's finalizer — it runs on
 * success, failure and interruption alike (R30): a failed run writes the
 * `error` terminal event as the last line of the stdout stream; a successful
 * run whose only console output was the framework's help/version rendering
 * emits that captured document as the `help` terminal event, so `--help` in
 * machine mode never leaks an ANSI document. A successful run with an empty
 * buffer (the normal verdict path) emits nothing extra — the run already
 * wrote its terminal `verdict` line through the same module — unless the
 * stream is still open, which means the run never reached a verdict (the
 * `--dryRunOnly` early return): then a null-score `verdict` closes the
 * stream so the last stdout line is always a terminal event (R5).
 */
export function emitMachineModeOutput(
  stream: RunEventStream,
  mode: ResolvedMode,
  exit: Exit.Exit<unknown, unknown>,
  code: number,
  argv: readonly string[],
  basePath: string,
): Effect.Effect<void, never, never> {
  return Effect.gen(function*() {
    const captured = readCapturedConsole()
    const value = failureValue(exit)
    const helpShaped = Exit.isFailure(exit) && S.is(CliError.ShowHelp)(value) && value.errors.length === 0
    if (helpShaped) {
      const document: HelpRendered = {
        kind: 'help',
        schemaVersion: STREAM_SCHEMA_VERSION,
        code: 0,
        help: captured,
      }
      stream.sink(document)
      return
    }
    if (Exit.isFailure(exit)) {
      stream.sink({ kind: 'error', ...buildErrorEnvelope(exit, code, captured, argv) })
      return
    }
    if (captured.length > 0) {
      const document: HelpRendered = {
        kind: 'help',
        schemaVersion: STREAM_SCHEMA_VERSION,
        code: 0,
        help: captured,
      }
      stream.sink(document)
      return
    }
    if (stream.isOpen()) {
      const defaults = yield* defaultOptions
      emitNullScoreVerdict(stream, mode, defaults.thresholds, {}, basePath)
    }
  })
}
