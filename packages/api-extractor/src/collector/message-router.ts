import type * as tsdoc from '@microsoft/tsdoc'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type { PlatformError } from 'effect/PlatformError'
import * as Ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { AstSymbol } from '../analyzer/AstSymbol.js'
import type { MessagesConfig } from '../config/config-file.schema.js'
import { allExtractorMessageIds, type ExtractorMessageId } from './extractor-message-id.js'
import {
  ExtractorMessage,
  ExtractorMessageCategory,
  type ExtractorMessageProperties,
  type LogLevelValue,
} from './extractor-message.js'
import { LogLevel } from './message-router.schema.js'
import type { SourceMapper } from './SourceMapper.js'
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

interface ReportingRule {
  readonly logLevel: LogLevelValue
  readonly addToApiReportFile: boolean
}

const compilerDefaultRule: ReportingRule = { logLevel: 'none', addToApiReportFile: false }
const extractorDefaultRule: ReportingRule = { logLevel: 'none', addToApiReportFile: false }
const tsdocDefaultRule: ReportingRule = { logLevel: 'none', addToApiReportFile: false }

const normalizeRule = (rule: {
  readonly logLevel: LogLevelValue
  readonly addToApiReportFile?: boolean | undefined
}): ReportingRule => ({
  logLevel: rule.logLevel,
  addToApiReportFile: rule.addToApiReportFile ?? false,
})

export interface MessageRouterOptions {
  readonly messagesConfig?: MessagesConfig | undefined
  readonly workingPackageFolder?: string | undefined
  readonly sourceMapper?: SourceMapper | undefined
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

const diagnosticsLine = '='.repeat(60)

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
  readonly log: (messageId: ConsoleMessageId, level: LogLevel, text: string) => Effect.Effect<void, PlatformError>
  readonly logError: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logWarning: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logInfo: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logVerbose: (messageId: ConsoleMessageId, text: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnostic: (text: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnosticHeader: (title: string) => Effect.Effect<void, PlatformError>
  readonly logDiagnosticFooter: Effect.Effect<void, PlatformError>

  readonly addCompilerDiagnostic: (diagnostic: Ts.Diagnostic) => void
  readonly addAnalyzerIssue: (
    messageId: ExtractorMessageId | string,
    messageText: string,
    astDeclarationOrSymbol: AstDeclaration | AstSymbol,
    properties?: ExtractorMessageProperties,
  ) => void
  readonly addAnalyzerIssueForPosition: (
    messageId: ExtractorMessageId | string,
    messageText: string,
    sourceFile: Ts.SourceFile,
    pos: number,
    properties?: ExtractorMessageProperties,
  ) => ExtractorMessage
  readonly addTsdocMessages: (
    parserContext: tsdoc.ParserContext,
    sourceFile: Ts.SourceFile,
    astDeclaration?: AstDeclaration,
  ) => void
  readonly fetchAssociatedMessagesForReviewFile: (astDeclaration: AstDeclaration) => readonly ExtractorMessage[]
  readonly fetchUnassociatedMessagesForReviewFile: () => readonly ExtractorMessage[]
  readonly handleRemainingNonConsoleMessages: Effect.Effect<void, PlatformError>
  readonly messages: () => readonly ExtractorMessage[]
  readonly errorCount: () => number
  readonly warningCount: () => number
}

const applyMessagesConfig = (
  messagesConfig: MessagesConfig | undefined,
): {
  readonly ruleByMessageId: Map<string, ReportingRule>
  readonly defaults: Readonly<Record<ExtractorMessageCategory, ReportingRule>>
} => {
  const ruleByMessageId = new Map<string, ReportingRule>()
  const defaults: Record<ExtractorMessageCategory, ReportingRule> = {
    [ExtractorMessageCategory.Compiler]: { ...compilerDefaultRule },
    [ExtractorMessageCategory.Extractor]: { ...extractorDefaultRule },
    [ExtractorMessageCategory.TSDoc]: { ...tsdocDefaultRule },
    [ExtractorMessageCategory.Console]: { ...compilerDefaultRule },
  }
  if (messagesConfig?.compilerMessageReporting !== undefined) {
    for (const messageId of Object.getOwnPropertyNames(messagesConfig.compilerMessageReporting)) {
      const entry = messagesConfig.compilerMessageReporting[messageId]
      if (entry === undefined) {
        continue
      }
      const reportingRule = normalizeRule(entry)
      if (messageId === 'default') {
        defaults[ExtractorMessageCategory.Compiler] = reportingRule
      } else if (!/^TS[0-9]+$/.test(messageId)) {
        throw new Error(
          `Error in API Extractor config: The messages.compilerMessageReporting table contains` +
            ` an invalid entry "${messageId}". The identifier format is "TS" followed by an integer.`,
        )
      } else {
        ruleByMessageId.set(messageId, reportingRule)
      }
    }
  }
  if (messagesConfig?.extractorMessageReporting !== undefined) {
    for (const messageId of Object.getOwnPropertyNames(messagesConfig.extractorMessageReporting)) {
      const entry = messagesConfig.extractorMessageReporting[messageId]
      if (entry === undefined) {
        continue
      }
      const reportingRule = normalizeRule(entry)
      if (messageId === 'default') {
        defaults[ExtractorMessageCategory.Extractor] = reportingRule
      } else if (!messageId.startsWith('ae-')) {
        throw new Error(
          `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
            ` an invalid entry "${messageId}".  The name should begin with the "ae-" prefix.`,
        )
      } else if (!allExtractorMessageIds.has(messageId)) {
        throw new Error(
          `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
            ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`,
        )
      } else {
        ruleByMessageId.set(messageId, reportingRule)
      }
    }
  }
  if (messagesConfig?.tsdocMessageReporting !== undefined) {
    for (const messageId of Object.getOwnPropertyNames(messagesConfig.tsdocMessageReporting)) {
      const entry = messagesConfig.tsdocMessageReporting[messageId]
      if (entry === undefined) {
        continue
      }
      const reportingRule = normalizeRule(entry)
      if (messageId === 'default') {
        defaults[ExtractorMessageCategory.TSDoc] = reportingRule
      } else if (!messageId.startsWith('tsdoc-')) {
        throw new Error(
          `Error in API Extractor config: The messages.tsdocMessageReporting table contains` +
            ` an invalid entry "${messageId}".  The name should begin with the "tsdoc-" prefix.`,
        )
      } else {
        ruleByMessageId.set(messageId, reportingRule)
      }
    }
  }
  return { ruleByMessageId, defaults }
}

export const makeMessageRouter = (
  request: VerbosityRequest,
  options: MessageRouterOptions = {},
): Effect.Effect<MessageRouter, never, MessageWriter> =>
  Effect.map(MessageWriter, (writer) => {
    const verbosity = resolveVerbosity(request)
    const { ruleByMessageId, defaults } = applyMessagesConfig(options.messagesConfig)
    const workingPackageFolder = options.workingPackageFolder
    const sourceMapper = options.sourceMapper

    const messages: ExtractorMessage[] = []
    const associatedMessagesForAstDeclaration = new Map<AstDeclaration, ExtractorMessage[]>()
    let errorCount = 0
    let warningCount = 0

    const emit = (level: LogLevel, text: string): Effect.Effect<void, PlatformError> =>
      Effect.suspend(() => (admits(verbosity, level) ? writer.write(level, format(level, text)) : Effect.void))

    const logDiagnostic = (text: string): Effect.Effect<void, PlatformError> =>
      verbosity === 'diagnostics' ? emit('verbose', text) : Effect.void

    const getRuleForMessage = (message: ExtractorMessage): ReportingRule => {
      const reportingRule = ruleByMessageId.get(message.messageId)
      if (reportingRule !== undefined) {
        return reportingRule
      }
      switch (message.category) {
        case ExtractorMessageCategory.Compiler:
          return defaults[ExtractorMessageCategory.Compiler]
        case ExtractorMessageCategory.Extractor:
          return defaults[ExtractorMessageCategory.Extractor]
        case ExtractorMessageCategory.TSDoc:
          return defaults[ExtractorMessageCategory.TSDoc]
        case ExtractorMessageCategory.Console:
          throw new Error('ExtractorMessageCategory.Console is not supported with IReportingRule')
      }
    }

    const prepareMessage = (message: ExtractorMessage): LogLevelValue => {
      if (message.handled) {
        return 'none'
      }
      if (message.category !== ExtractorMessageCategory.Console) {
        message.logLevel = getRuleForMessage(message).logLevel
      }
      if (message.logLevel === 'error') {
        errorCount++
      } else if (message.logLevel === 'warning') {
        warningCount++
      }
      message.markHandled()
      return message.logLevel
    }

    const messageTextOf = (message: ExtractorMessage): string =>
      message.category === ExtractorMessageCategory.Console
        ? message.text
        : message.formatMessageWithLocation(workingPackageFolder)

    const associateMessageWithAstDeclaration = (message: ExtractorMessage, astDeclaration: AstDeclaration): void => {
      const associatedMessages = associatedMessagesForAstDeclaration.get(astDeclaration)
      if (associatedMessages === undefined) {
        associatedMessagesForAstDeclaration.set(astDeclaration, [message])
      } else {
        associatedMessages.push(message)
      }
    }

    const addAnalyzerIssueForPosition = (
      messageId: ExtractorMessageId | string,
      messageText: string,
      sourceFile: Ts.SourceFile,
      pos: number,
      properties?: ExtractorMessageProperties,
    ): ExtractorMessage => {
      const sourceLocation = sourceMapper?.getSourceLocation({ sourceFile, pos })
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
      const message = new ExtractorMessage({
        category: ExtractorMessageCategory.Extractor,
        messageId,
        text: messageText,
        properties,
        sourceFilePath: sourceLocation?.sourceFilePath ?? sourceFile.fileName,
        sourceFileLine: sourceLocation?.sourceFileLine ?? line + 1,
        sourceFileColumn: sourceLocation?.sourceFileColumn ?? character + 1,
      })
      messages.push(message)
      return message
    }

    const logMessage = (message: ExtractorMessage): Effect.Effect<void, PlatformError> => {
      const level = prepareMessage(message)
      return level === 'none' ? Effect.void : emit(level, messageTextOf(message))
    }

    const consoleMessage = (level: LogLevelValue, text: string): ExtractorMessage =>
      new ExtractorMessage({
        category: ExtractorMessageCategory.Console,
        messageId: 'console',
        text,
        logLevel: level,
      })

    return {
      verbosity,
      log: (_id, level, text) => logMessage(consoleMessage(level, text)),
      logError: (_id, text) => logMessage(consoleMessage('error', text)),
      logWarning: (_id, text) => logMessage(consoleMessage('warning', text)),
      logInfo: (_id, text) => logMessage(consoleMessage('info', text)),
      logVerbose: (_id, text) => logMessage(consoleMessage('verbose', text)),
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

      addCompilerDiagnostic: (diagnostic) => {
        if (
          diagnostic.category === Ts.DiagnosticCategory.Suggestion ||
          diagnostic.category === Ts.DiagnosticCategory.Message
        ) {
          return
        }
        const messageText = Ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        const message = new ExtractorMessage({
          category: ExtractorMessageCategory.Compiler,
          messageId: `TS${diagnostic.code}`,
          text: messageText,
        })
        if (diagnostic.file !== undefined) {
          const sourceLocation = sourceMapper?.getSourceLocation({
            sourceFile: diagnostic.file,
            pos: diagnostic.start ?? 0,
            useDtsLocation: true,
          })
          if (sourceLocation !== undefined) {
            message.sourceFilePath = sourceLocation.sourceFilePath
            message.sourceFileLine = sourceLocation.sourceFileLine
            message.sourceFileColumn = sourceLocation.sourceFileColumn
          } else {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
            message.sourceFilePath = diagnostic.file.fileName
            message.sourceFileLine = line + 1
            message.sourceFileColumn = character + 1
          }
        }
        messages.push(message)
      },

      addAnalyzerIssue: (messageId, messageText, astDeclarationOrSymbol, properties) => {
        const astDeclaration = astDeclarationOrSymbol instanceof AstDeclaration
          ? astDeclarationOrSymbol
          : astDeclarationOrSymbol.astDeclarations[0]
        if (astDeclaration === undefined) {
          return
        }
        const message = addAnalyzerIssueForPosition(
          messageId,
          messageText,
          astDeclaration.declaration.getSourceFile(),
          astDeclaration.declaration.getStart(),
          properties,
        )
        associateMessageWithAstDeclaration(message, astDeclaration)
      },

      addAnalyzerIssueForPosition: (messageId, messageText, sourceFile, pos, properties) => {
        const sourceLocation = sourceMapper?.getSourceLocation({ sourceFile, pos })
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
        const message = new ExtractorMessage({
          category: ExtractorMessageCategory.Extractor,
          messageId,
          text: messageText,
          properties,
          sourceFilePath: sourceLocation?.sourceFilePath ?? sourceFile.fileName,
          sourceFileLine: sourceLocation?.sourceFileLine ?? line + 1,
          sourceFileColumn: sourceLocation?.sourceFileColumn ?? character + 1,
        })
        messages.push(message)
        return message
      },

      addTsdocMessages: (parserContext, sourceFile, astDeclaration) => {
        for (const message of parserContext.log.messages) {
          const sourceLocation = sourceMapper?.getSourceLocation({ sourceFile, pos: message.textRange.pos })
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(message.textRange.pos)
          const extractorMessage = new ExtractorMessage({
            category: ExtractorMessageCategory.TSDoc,
            messageId: message.messageId,
            text: message.unformattedText,
            sourceFilePath: sourceLocation?.sourceFilePath ?? sourceFile.fileName,
            sourceFileLine: sourceLocation?.sourceFileLine ?? line + 1,
            sourceFileColumn: sourceLocation?.sourceFileColumn ?? character + 1,
          })
          if (astDeclaration !== undefined) {
            associateMessageWithAstDeclaration(extractorMessage, astDeclaration)
          }
          messages.push(extractorMessage)
        }
      },

      fetchAssociatedMessagesForReviewFile: (astDeclaration) => {
        const messagesForApiReportFile: ExtractorMessage[] = []
        const associatedMessages = associatedMessagesForAstDeclaration.get(astDeclaration) ?? []
        for (const associatedMessage of associatedMessages) {
          if (!associatedMessage.handled) {
            if (getRuleForMessage(associatedMessage).addToApiReportFile) {
              messagesForApiReportFile.push(associatedMessage)
              associatedMessage.markHandled()
            }
          }
        }
        sortMessagesForOutput(messagesForApiReportFile)
        return messagesForApiReportFile
      },

      fetchUnassociatedMessagesForReviewFile: () => {
        const messagesForApiReportFile: ExtractorMessage[] = []
        for (const unassociatedMessage of messages) {
          if (!unassociatedMessage.handled) {
            if (getRuleForMessage(unassociatedMessage).addToApiReportFile) {
              messagesForApiReportFile.push(unassociatedMessage)
              unassociatedMessage.markHandled()
            }
          }
        }
        sortMessagesForOutput(messagesForApiReportFile)
        return messagesForApiReportFile
      },

      handleRemainingNonConsoleMessages: Effect.suspend(() => {
        const messagesForLogger: ExtractorMessage[] = []
        for (const message of messages) {
          if (!message.handled) {
            messagesForLogger.push(message)
          }
        }
        sortMessagesForOutput(messagesForLogger)
        const writes: Array<{ readonly level: LogLevel; readonly text: string }> = []
        for (const message of messagesForLogger) {
          const level = prepareMessage(message)
          if (level !== 'none') {
            writes.push({ level, text: messageTextOf(message) })
          }
        }
        return Effect.forEach(writes, ({ level, text }) => emit(level, text), {
          discard: true,
        })
      }),

      messages: () => messages,
      errorCount: () => errorCount,
      warningCount: () => warningCount,
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
