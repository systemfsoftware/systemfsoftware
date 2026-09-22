import { Effect, Match, Option, Result } from 'effect'
import type { PlatformError } from 'effect/PlatformError'

import type { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { MessageLogLevel, MessageReportingTable, MessagesConfig } from '../config/config-file.schema.js'
import { MessageWriter } from '../message-writer.service.js'
import { allExtractorMessageIds } from './extractor-message-id.js'
import {
  ConsoleMessageId,
  ExtractorMessage,
  MessageLog,
  type ReportCandidate,
  selectReportMessages,
} from './message-log.js'
import { type ExtractorMessageCategory, LogLevel, MessageRuleError } from './message-router.schema.js'
import { ResolveVerbosity, resolveVerbosity } from './resolve-verbosity.workflow.js'
import {
  type MessageReportingRules,
  type ReportingRule,
  RouteExtractorMessage,
  routeExtractorMessage,
  type RoutingDecision,
} from './route-extractor-message.workflow.js'
import type { SourceMapper } from './SourceMapper.js'
import { Verbosity, type VerbosityRequest } from './verbosity.schema.js'

export interface MessageRouterOptions {
  readonly messagesConfig?: MessagesConfig | undefined
  readonly workingPackageFolder?: string | undefined
  readonly sourceMapper?: SourceMapper | undefined
  readonly reportEnabled?: boolean | undefined
}

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

const compareByValue = (a: string | number | undefined, b: string | number | undefined): number => {
  if (a === b) {
    return 0
  }
  const left = a ?? ''
  const right = b ?? ''
  return left < right ? -1 : 1
}

const sortMessagesForOutput = (messages: ExtractorMessage[]): void => {
  messages.sort((a, b) => {
    const byFile = compareByValue(a.sourceFilePath, b.sourceFilePath)
    if (byFile !== 0) {
      return byFile
    }
    const byLine = compareByValue(a.sourceFileLine, b.sourceFileLine)
    if (byLine !== 0) {
      return byLine
    }
    return compareByValue(a.messageId, b.messageId)
  })
}

export interface MessageRouter {
  readonly verbosity: Verbosity
  readonly messageLog: MessageLog
  readonly log: (messageId: ConsoleMessageId, level: LogLevel, text: string) => Effect.Effect<void, PlatformError>
  readonly logError: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logWarning: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logInfo: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logVerbose: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly emitAnalysisConsoleMessages: Effect.Effect<void, PlatformError>
  readonly fetchAssociatedMessagesForReviewFile: (astDeclaration: AstDeclaration) => readonly ExtractorMessage[]
  readonly fetchUnassociatedMessagesForReviewFile: () => readonly ExtractorMessage[]
  readonly handleRemainingNonConsoleMessages: Effect.Effect<void, PlatformError>
  readonly messages: () => readonly ExtractorMessage[]
  readonly errorCount: () => number
  readonly warningCount: () => number
}

interface RuleSection {
  readonly category: ExtractorMessageCategory
  readonly defaultKey: 'compilerDefault' | 'extractorDefault' | 'tsdocDefault'
  readonly entries: MessageReportingTable | undefined
  readonly validate: (messageId: string) => Result.Result<void, MessageRuleError>
}

const normalizeRule = (rule: {
  readonly logLevel: MessageLogLevel
  readonly addToApiReportFile?: boolean | undefined
}): ReportingRule => ({
  logLevel: rule.logLevel,
  addToApiReportFile: rule.addToApiReportFile ?? false,
})

const validateCompilerMessageId = (messageId: string): Result.Result<void, MessageRuleError> =>
  /^TS[0-9]+$/.test(messageId)
    ? Result.void
    : Result.fail(
      new MessageRuleError({
        message: `Error in API Extractor config: The messages.compilerMessageReporting table contains` +
          ` an invalid entry "${messageId}". The identifier format is "TS" followed by an integer.`,
      }),
    )

const validateExtractorMessageId = (messageId: string): Result.Result<void, MessageRuleError> => {
  if (!messageId.startsWith('ae-')) {
    return Result.fail(
      new MessageRuleError({
        message: `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
          ` an invalid entry "${messageId}".  The name should begin with the "ae-" prefix.`,
      }),
    )
  }
  return allExtractorMessageIds.has(messageId)
    ? Result.void
    : Result.fail(
      new MessageRuleError({
        message: `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
          ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`,
      }),
    )
}

const validateTsdocMessageId = (messageId: string): Result.Result<void, MessageRuleError> =>
  messageId.startsWith('tsdoc-')
    ? Result.void
    : Result.fail(
      new MessageRuleError({
        message: `Error in API Extractor config: The messages.tsdocMessageReporting table contains` +
          ` an invalid entry "${messageId}".  The name should begin with the "tsdoc-" prefix.`,
      }),
    )

const applyRuleSection = (
  rules: MessageReportingRules,
  section: RuleSection,
): Result.Result<MessageReportingRules, MessageRuleError> => {
  const { entries } = section
  if (entries === undefined) {
    return Result.succeed(rules)
  }
  return Object.getOwnPropertyNames(entries).reduce<Result.Result<MessageReportingRules, MessageRuleError>>(
    (outcome, messageId) => {
      if (Result.isFailure(outcome)) {
        return outcome
      }
      const table = outcome.success
      const entry = entries[messageId]
      if (entry === undefined) {
        return Result.succeed(table)
      }
      const reportingRule = normalizeRule(entry)
      if (messageId === 'default') {
        return Result.succeed({ ...table, [section.defaultKey]: reportingRule })
      }
      const validation = section.validate(messageId)
      if (Result.isFailure(validation)) {
        return Result.fail(validation.failure)
      }
      return Result.succeed({
        ...table,
        byMessageId: { ...table.byMessageId, [messageId]: reportingRule },
      })
    },
    Result.succeed(rules),
  )
}

const ruleSections = (messagesConfig: MessagesConfig | undefined): readonly RuleSection[] => [
  {
    category: 'Compiler',
    defaultKey: 'compilerDefault',
    entries: messagesConfig?.compilerMessageReporting,
    validate: validateCompilerMessageId,
  },
  {
    category: 'Extractor',
    defaultKey: 'extractorDefault',
    entries: messagesConfig?.extractorMessageReporting,
    validate: validateExtractorMessageId,
  },
  {
    category: 'TSDoc',
    defaultKey: 'tsdocDefault',
    entries: messagesConfig?.tsdocMessageReporting,
    validate: validateTsdocMessageId,
  },
]

const initialRuleTable = (): MessageReportingRules => ({
  byMessageId: {},
  compilerDefault: { logLevel: 'none', addToApiReportFile: false },
  extractorDefault: { logLevel: 'none', addToApiReportFile: false },
  tsdocDefault: { logLevel: 'none', addToApiReportFile: false },
})

const buildRuleTable = (
  messagesConfig: MessagesConfig | undefined,
): Result.Result<MessageReportingRules, MessageRuleError> =>
  ruleSections(messagesConfig).reduce<Result.Result<MessageReportingRules, MessageRuleError>>(
    (outcome, section) => (Result.isFailure(outcome) ? outcome : applyRuleSection(outcome.success, section)),
    Result.succeed(initialRuleTable()),
  )

const verbosityOf = (request: VerbosityRequest): Verbosity => {
  const decision = Result.getOrThrow(
    resolveVerbosity(
      ResolveVerbosity.make({
        cliFlags: request.cliFlags,
        configQuiet: request.configQuiet === true,
      }),
    ),
  )
  return Match.value(decision).pipe(
    Match.tag('VerbosityDiagnostics', (): Verbosity => 'diagnostics'),
    Match.tag('VerbosityVerbose', (): Verbosity => 'verbose'),
    Match.tag('VerbositySilent', (): Verbosity => 'silent'),
    Match.tag('VerbosityNormal', (): Verbosity => 'normal'),
    Match.exhaustive,
  )
}

const commandOf = (
  message: ExtractorMessage,
  rules: MessageReportingRules,
  reportEnabled: boolean,
): RouteExtractorMessage =>
  message.category === 'console'
    ? RouteExtractorMessage.make({
      category: message.category,
      messageId: message.messageId,
      logLevel: message.logLevel,
      rules,
      reportEnabled,
    })
    : RouteExtractorMessage.make({
      category: message.category,
      messageId: message.messageId,
      rules,
      reportEnabled,
    })

const consoleLevelOf = (decision: RoutingDecision): Option.Option<LogLevel> =>
  Match.value(decision).pipe(
    Match.tag('RoutedToConsole', ({ level }) => Option.some(level)),
    Match.tag('RoutedToReport', () => Option.none<LogLevel>()),
    Match.tag('RoutedSuppressed', () => Option.none<LogLevel>()),
    Match.exhaustive,
  )

export const makeMessageRouter = (
  request: VerbosityRequest,
  options: MessageRouterOptions = {},
): Effect.Effect<MessageRouter, MessageRuleError, MessageWriter> =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    const verbosity = verbosityOf(request)
    const rules = yield* Effect.fromResult(buildRuleTable(options.messagesConfig))
    const reportEnabled = options.reportEnabled ?? false
    const workingPackageFolder = options.workingPackageFolder

    const messageLog = new MessageLog({
      sourceMapper: options.sourceMapper,
      diagnostics: verbosity === 'diagnostics',
    })

    const decisionOf = (message: ExtractorMessage): RoutingDecision =>
      Result.getOrThrow(routeExtractorMessage(commandOf(message, rules, reportEnabled)))

    const emit = (level: LogLevel, text: string): Effect.Effect<void, PlatformError> =>
      Effect.suspend(() => (admits(verbosity, level) ? writer.write(level, format(level, text)) : Effect.void))

    const logMessage = (level: LogLevel, text: string): Effect.Effect<void, PlatformError> =>
      Effect.sync(() => {
        messageLog.addConsoleMessage('console', level, text).markHandled()
      }).pipe(Effect.andThen(emit(level, text)))

    const consoleLine = (message: ExtractorMessage): { readonly level: LogLevel; readonly text: string } => ({
      level: message.logLevel,
      text: message.text,
    })

    const candidatesOf = (messages: readonly ExtractorMessage[]): readonly ReportCandidate[] =>
      messages.map((message) => ({ message, decision: decisionOf(message), consumed: message.handled }))

    const consumedLevelOf = (message: ExtractorMessage): LogLevel =>
      message.handled ? 'none' : Option.getOrElse(consoleLevelOf(decisionOf(message)), () => 'none' as const)

    const analysisLevelOf = (message: ExtractorMessage): LogLevel =>
      Match.value(message.category).pipe(
        Match.when('console', () => message.logLevel),
        Match.when('Compiler', () => consumedLevelOf(message)),
        Match.when('Extractor', () => consumedLevelOf(message)),
        Match.when('TSDoc', () => consumedLevelOf(message)),
        Match.exhaustive,
      )

    return {
      verbosity,
      messageLog,
      log: (_id, level, text) => logMessage(level, text),
      logError: (_id, text) => logMessage('error', text),
      logWarning: (_id, text) => logMessage('warning', text),
      logInfo: (_id, text) => logMessage('info', text),
      logVerbose: (_id, text) => logMessage('verbose', text),

      emitAnalysisConsoleMessages: Effect.suspend(() => {
        const pending = messageLog.messages().filter((message) => message.category === 'console' && !message.handled)
        pending.forEach((message) => message.markHandled())
        const writes = pending.map(consoleLine)
        return Effect.forEach(writes, ({ level, text }) => emit(level, text), { discard: true })
      }),

      fetchAssociatedMessagesForReviewFile: (astDeclaration) => {
        const selected = selectReportMessages(candidatesOf(messageLog.associatedMessagesOf(astDeclaration)))
        sortMessagesForOutput(selected)
        selected.forEach((message) => message.markHandled())
        return selected
      },

      fetchUnassociatedMessagesForReviewFile: () => {
        const selected = selectReportMessages(candidatesOf(messageLog.messages()))
        sortMessagesForOutput(selected)
        selected.forEach((message) => message.markHandled())
        return selected
      },

      handleRemainingNonConsoleMessages: Effect.suspend(() => {
        const messagesForLogger = messageLog.messages().filter(
          (message) => message.category !== 'console' && !message.handled,
        )
        sortMessagesForOutput(messagesForLogger)
        const writes = messagesForLogger.flatMap((message) => {
          const level = Option.getOrUndefined(consoleLevelOf(decisionOf(message)))
          return level === undefined ? [] : [{ level, text: message.formatMessageWithLocation(workingPackageFolder) }]
        })
        return Effect.forEach(writes, ({ level, text }) => emit(level, text), { discard: true })
      }),

      messages: () => messageLog.messages(),
      errorCount: () => messageLog.messages().filter((message) => analysisLevelOf(message) === 'error').length,
      warningCount: () => messageLog.messages().filter((message) => analysisLevelOf(message) === 'warning').length,
    }
  })

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
}
