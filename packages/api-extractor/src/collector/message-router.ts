import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type { PlatformError } from 'effect/PlatformError'

import { LogLevel } from './message-router.schema.js'
import { resolveVerbosity } from './verbosity.js'
import { Verbosity, type VerbosityRequest } from './verbosity.schema.js'

export { LogLevel } from './message-router.schema.js'

export const ConsoleMessageId = {
  Preamble: 'console-preamble',
  CompilerVersionNotice: 'console-compiler-version-notice',
  UsingCustomTSDocConfig: 'console-using-custom-tsdoc-config',
  FoundTSDocMetadata: 'console-found-tsdoc-metadata',
  WritingDocModelFile: 'console-writing-doc-model-file',
  WritingDtsRollup: 'console-writing-dts-rollup',
  WritingApiReport: 'console-writing-api-report',
  ApiReportNotCopied: 'console-api-report-not-copied',
  ApiReportDiff: 'console-api-report-diff',
  ApiReportCopied: 'console-api-report-copied',
  ApiReportUnchanged: 'console-api-report-unchanged',
  ApiReportCreated: 'console-api-report-created',
  ApiReportFolderMissing: 'console-api-report-folder-missing',
  Diagnostics: 'console-diagnostics',
  Banner: 'console-banner',
  ConfigPath: 'console-config-path',
  CompletedSuccessfully: 'console-completed-successfully',
} as const

export type ConsoleMessageId = (typeof ConsoleMessageId)[keyof typeof ConsoleMessageId]

export interface MessageWriter {
  readonly write: (level: LogLevel, text: string) => Effect.Effect<void, PlatformError>
}

export const MessageWriter = Context.Service<MessageWriter>('@systemfsoftware/api-extractor/MessageWriter')

const levelLabel: Readonly<Record<LogLevel, string>> = {
  none: '',
  error: 'Error: ',
  warning: 'Warning: ',
  info: '',
  verbose: '',
}

const format = (level: LogLevel, text: string): string => levelLabel[level] + text

const isVerboseAdmitted = (v: Verbosity): boolean => v === 'verbose' || v === 'diagnostics'

const levelMatrix: Readonly<Record<LogLevel, (verbosity: Verbosity) => boolean>> = {
  none: () => false,
  error: () => true,
  warning: () => true,
  info: (v) => v !== 'silent',
  verbose: isVerboseAdmitted,
}

const admits = (verbosity: Verbosity, level: LogLevel): boolean => levelMatrix[level](verbosity)

const diagnosticsLine = '='.repeat(60)

export interface MessageRouter {
  readonly verbosity: Verbosity
  readonly log: (messageId: ConsoleMessageId, level: LogLevel, text: string) => Effect.Effect<void, PlatformError>
  readonly logError: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logWarning: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logInfo: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logVerbose: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnostic: (text: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnosticHeader: (title: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnosticFooter: Effect.Effect<void, PlatformError>
}

export const makeMessageRouter = (
  request: VerbosityRequest,
): Effect.Effect<MessageRouter, never, MessageWriter> =>
  Effect.map(MessageWriter, (writer) => {
    const verbosity = resolveVerbosity(request)
    const emit = (level: LogLevel, text: string): Effect.Effect<void, PlatformError> =>
      Effect.suspend(() => (admits(verbosity, level) ? writer.write(level, format(level, text)) : Effect.void))

    const logDiagnostic = (text: string): Effect.Effect<void, PlatformError> =>
      verbosity === 'diagnostics' ? emit('verbose', text) : Effect.void

    return {
      verbosity,
      log: (_id, level, text) => emit(level, text),
      logError: (_id, text) => emit('error', text),
      logWarning: (_id, text) => emit('warning', text),
      logInfo: (_id, text) => emit('info', text),
      logVerbose: (_id, text) => emit('verbose', text),
      logDiagnostic,
      logDiagnosticHeader: (title) =>
        Effect.andThen(
          logDiagnostic(diagnosticsLine),
          Effect.andThen(
            logDiagnostic(`DIAGNOSTIC: ${title}`),
            logDiagnostic(diagnosticsLine),
          ),
        ),
      logDiagnosticFooter: logDiagnostic(`${diagnosticsLine}\n`),
    }
  })

/**
 * A MessageWriter whose writes are synchronous console output.
 *
 * The ported Collector emits log lines fire-and-forget from deep inside
 * synchronous analysis code (upstream called `console.log` directly). A
 * Terminal-backed writer is asynchronous under NodeServices, which makes
 * `Effect.runSync` around those emits a defect (AsyncFiberError). The
 * console writer keeps the fire-and-forget call sites lawful: every write
 * is `Effect.sync`, so `runSync` never suspends.
 */
export const ConsoleMessageWriter: MessageWriter = {
  write: (level, text) =>
    Effect.sync(() => {
      const stream = level === 'error' ? process.stderr : process.stdout
      stream.write(format(level, text) + '\n')
    }),
}

if (import.meta.vitest !== void 0) {
  // Exception: in-source tests load @effect/vitest dynamically to avoid bundling test libraries
  const { it } = await import('@effect/vitest')

  interface RecordedLine {
    readonly level: LogLevel
    readonly text: string
  }

  const createRecordingWriter = (lines: RecordedLine[]): MessageWriter => ({
    write: (level, text) =>
      Effect.sync(() => {
        lines.push({ level, text })
      }),
  })

  const expectedLineCount = (admitted: boolean): number => (admitted ? 1 : 0)

  const hasExpectedContent = (lines: readonly RecordedLine[], expectedText: string): boolean => {
    const first = lines[0]
    return first === undefined ? true : first.text === expectedText
  }

  const routerForVerbosity = (verbosity: Verbosity, lines: RecordedLine[]) =>
    makeMessageRouter({
      cliFlags: {
        quiet: verbosity === 'silent',
        verbose: verbosity === 'verbose',
        diagnostics: verbosity === 'diagnostics',
      },
    }).pipe(Effect.provideService(MessageWriter, createRecordingWriter(lines)))

  it.effect.prop(
    '∀v_Routing_≡Admitted',
    [Verbosity, LogLevel],
    ([verbosity, level]) =>
      Effect.gen(function*() {
        const lines: RecordedLine[] = []
        const router = yield* routerForVerbosity(verbosity, lines)
        yield* router.log(ConsoleMessageId.Preamble, level, 'payload')
        const shouldAdmit = admits(verbosity, level)
        return (
          lines.length === expectedLineCount(shouldAdmit) &&
          hasExpectedContent(lines, format(level, 'payload'))
        )
      }),
  )

  it.effect.prop(
    '∀v_Diagnostics_≡Flagged',
    [Verbosity],
    ([verbosity]) =>
      Effect.gen(function*() {
        const lines: RecordedLine[] = []
        const router = yield* routerForVerbosity(verbosity, lines)
        yield* router.logDiagnostic('test-diag')
        return lines.length === expectedLineCount(verbosity === 'diagnostics')
      }),
  )
}
