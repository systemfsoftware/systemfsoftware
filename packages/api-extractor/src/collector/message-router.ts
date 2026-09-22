import type * as tsdoc from '@microsoft/tsdoc'
import { Context, Data, Effect, Match, Result } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import * as Ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { AstSymbol } from '../analyzer/AstSymbol.js'
import { SourceFileLocationFormatter } from '../analyzer/SourceFileLocationFormatter.js'
import type { MessageReportingTable, MessagesConfig } from '../config/config-file.schema.js'
import { allExtractorMessageIds, type ExtractorMessageId } from './extractor-message-id.js'
import { LogLevel, MessageRuleError } from './message-router.schema.js'
import { ResolveVerbosity, resolveVerbosity } from './resolve-verbosity.workflow.js'
import type { SourceMapper } from './SourceMapper.js'

export const ExtractorMessageCategory = {
  Compiler: 'Compiler',
  TSDoc: 'TSDoc',
  Extractor: 'Extractor',
  Console: 'console',
} as const

export type ExtractorMessageCategory = (typeof ExtractorMessageCategory)[keyof typeof ExtractorMessageCategory]

export interface ExtractorMessageProperties {
  readonly exportName?: string
}

export type LogLevelValue = 'error' | 'warning' | 'none' | 'info' | 'verbose'

export interface ExtractorMessageProps {
  readonly category: ExtractorMessageCategory
  readonly messageId: string
  readonly text: string
  readonly sourceFilePath?: string | undefined
  readonly sourceFileLine?: number | undefined
  readonly sourceFileColumn?: number | undefined
  readonly properties?: ExtractorMessageProperties | undefined
  readonly logLevel?: LogLevelValue | undefined
}

export class ExtractorMessage extends Data.Class<ExtractorMessageProps> {
  declare public properties: ExtractorMessageProperties
  declare public logLevel: LogLevelValue
  declare public sourceFilePath: string | undefined
  declare public sourceFileLine: number | undefined
  declare public sourceFileColumn: number | undefined

  #handled: boolean

  constructor(props: ExtractorMessageProps) {
    super({
      ...props,
      properties: props.properties ?? {},
      logLevel: props.logLevel ?? 'none',
    })
    this.#handled = false
  }

  public get handled(): boolean {
    return this.#handled
  }

  public markHandled(): void {
    this.#handled = true
  }

  public formatMessageWithLocation(workingPackageFolderPath: string | undefined): string {
    let result = ''
    if (this.sourceFilePath !== undefined && this.sourceFilePath.length > 0) {
      result += SourceFileLocationFormatter.formatPath(this.sourceFilePath, {
        sourceFileLine: this.sourceFileLine,
        sourceFileColumn: this.sourceFileColumn,
        workingPackageFolderPath,
      })
      if (result.length > 0) {
        result += ' - '
      }
    }
    result += this.formatMessageWithoutLocation()
    return result
  }

  public formatMessageWithoutLocation(): string {
    return `(${this.messageId}) ${this.text}`
  }
}

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

interface RuleTable {
  readonly ruleByMessageId: Map<string, ReportingRule>
  readonly defaults: Readonly<Record<ExtractorMessageCategory, ReportingRule>>
}

const initialRuleTable = (): {
  ruleByMessageId: Map<string, ReportingRule>
  defaults: Record<ExtractorMessageCategory, ReportingRule>
} => ({
  ruleByMessageId: new Map<string, ReportingRule>(),
  defaults: {
    [ExtractorMessageCategory.Compiler]: compilerDefaultRule,
    [ExtractorMessageCategory.Extractor]: extractorDefaultRule,
    [ExtractorMessageCategory.TSDoc]: tsdocDefaultRule,
    [ExtractorMessageCategory.Console]: compilerDefaultRule,
  },
})
type MutableRuleTable = ReturnType<typeof initialRuleTable>

interface RuleSection {
  readonly category: ExtractorMessageCategory
  readonly entries: MessageReportingTable | undefined
  readonly validate: (messageId: string) => Result.Result<void, MessageRuleError>
}

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

const applyRuleSection = (table: MutableRuleTable, section: RuleSection): Result.Result<void, MessageRuleError> => {
  const { entries } = section
  if (entries === undefined) {
    return Result.void
  }
  return Object.getOwnPropertyNames(entries).reduce<Result.Result<void, MessageRuleError>>((outcome, messageId) => {
    if (Result.isFailure(outcome)) {
      return outcome
    }
    const entry = entries[messageId]
    if (entry === undefined) {
      return Result.void
    }
    const reportingRule = normalizeRule(entry)
    if (messageId === 'default') {
      table.defaults[section.category] = reportingRule
      return Result.void
    }
    const validation = section.validate(messageId)
    if (Result.isFailure(validation)) {
      return validation
    }
    table.ruleByMessageId.set(messageId, reportingRule)
    return Result.void
  }, Result.void)
}

const ruleSections = (messagesConfig: MessagesConfig | undefined): readonly RuleSection[] => [
  {
    category: ExtractorMessageCategory.Compiler,
    entries: messagesConfig?.compilerMessageReporting,
    validate: validateCompilerMessageId,
  },
  {
    category: ExtractorMessageCategory.Extractor,
    entries: messagesConfig?.extractorMessageReporting,
    validate: validateExtractorMessageId,
  },
  {
    category: ExtractorMessageCategory.TSDoc,
    entries: messagesConfig?.tsdocMessageReporting,
    validate: validateTsdocMessageId,
  },
]

const buildRuleTable = (messagesConfig: MessagesConfig | undefined): Result.Result<RuleTable, MessageRuleError> => {
  const table = initialRuleTable()
  const outcome = ruleSections(messagesConfig).reduce<Result.Result<void, MessageRuleError>>(
    (acc, section) => (Result.isFailure(acc) ? acc : applyRuleSection(table, section)),
    Result.void,
  )
  return Result.isFailure(outcome) ? Result.fail(outcome.failure) : Result.succeed(table)
}

const createAssociatedMessagesStore = (): Map<AstDeclaration, ExtractorMessage[]> =>
  new Map<AstDeclaration, ExtractorMessage[]>()

export const makeMessageRouter = (
  request: VerbosityRequest,
  options: MessageRouterOptions = {},
): Effect.Effect<MessageRouter, MessageRuleError, MessageWriter> =>
  Effect.gen(function*() {
    const writer = yield* MessageWriter
    const decision = Result.getOrThrow(
      resolveVerbosity(
        ResolveVerbosity.make({
          cliFlags: request.cliFlags,
          configQuiet: request.configQuiet === true,
        }),
      ),
    )
    const verbosity: Verbosity = Match.value(decision).pipe(
      Match.tag('VerbosityDiagnostics', () => 'diagnostics' as const),
      Match.tag('VerbosityVerbose', () => 'verbose' as const),
      Match.tag('VerbositySilent', () => 'silent' as const),
      Match.tag('VerbosityNormal', () => 'normal' as const),
      Match.exhaustive,
    )
    const { ruleByMessageId, defaults } = yield* Effect.fromResult(buildRuleTable(options.messagesConfig))
    const workingPackageFolder = options.workingPackageFolder
    const sourceMapper = options.sourceMapper

    const messages: ExtractorMessage[] = []
    const associatedMessagesForAstDeclaration = createAssociatedMessagesStore()
    let errorCount = 0
    let warningCount = 0

    const emit = (level: LogLevel, text: string): Effect.Effect<void, PlatformError> =>
      Effect.suspend(() => (admits(verbosity, level) ? writer.write(level, format(level, text)) : Effect.void))

    const logDiagnostic = (text: string): Effect.Effect<void, PlatformError> =>
      verbosity === 'diagnostics' ? emit('verbose', text) : Effect.void

    const ruleForCategory = (category: ExtractorMessageCategory): Result.Result<ReportingRule, MessageRuleError> =>
      Match.value(category).pipe(
        Match.when(
          ExtractorMessageCategory.Compiler,
          () => Result.succeed(defaults[ExtractorMessageCategory.Compiler]),
        ),
        Match.when(
          ExtractorMessageCategory.Extractor,
          () => Result.succeed(defaults[ExtractorMessageCategory.Extractor]),
        ),
        Match.when(ExtractorMessageCategory.TSDoc, () => Result.succeed(defaults[ExtractorMessageCategory.TSDoc])),
        Match.when(ExtractorMessageCategory.Console, () =>
          Result.fail(
            new MessageRuleError({
              message: 'ExtractorMessageCategory.Console is not supported with IReportingRule',
            }),
          )),
        Match.exhaustive,
      )

    const getRuleForMessage = (message: ExtractorMessage): Result.Result<ReportingRule, MessageRuleError> => {
      const reportingRule = ruleByMessageId.get(message.messageId)
      return reportingRule !== undefined ? Result.succeed(reportingRule) : ruleForCategory(message.category)
    }

    const prepareMessage = (message: ExtractorMessage): LogLevelValue => {
      if (message.handled) {
        return 'none'
      }
      if (message.category !== ExtractorMessageCategory.Console) {
        message.logLevel = Result.match(getRuleForMessage(message), {
          onSuccess: (rule) => rule.logLevel,
          onFailure: () => message.logLevel,
        })
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
        const associatedMessages = associatedMessagesForAstDeclaration.get(astDeclaration) ?? []
        const messagesForApiReportFile = associatedMessages.filter((associatedMessage) => {
          if (associatedMessage.handled) {
            return false
          }
          const admitsRule = Result.match(getRuleForMessage(associatedMessage), {
            onSuccess: (rule) => rule.addToApiReportFile,
            onFailure: () => false,
          })
          if (!admitsRule) {
            return false
          }
          associatedMessage.markHandled()
          return true
        })
        sortMessagesForOutput(messagesForApiReportFile)
        return messagesForApiReportFile
      },

      fetchUnassociatedMessagesForReviewFile: () => {
        const messagesForApiReportFile = messages.filter((unassociatedMessage) => {
          if (unassociatedMessage.handled) {
            return false
          }
          const admitsRule = Result.match(getRuleForMessage(unassociatedMessage), {
            onSuccess: (rule) => rule.addToApiReportFile,
            onFailure: () => false,
          })
          if (!admitsRule) {
            return false
          }
          unassociatedMessage.markHandled()
          return true
        })
        sortMessagesForOutput(messagesForApiReportFile)
        return messagesForApiReportFile
      },

      handleRemainingNonConsoleMessages: Effect.suspend(() => {
        const messagesForLogger = messages.filter((message) => !message.handled)
        sortMessagesForOutput(messagesForLogger)
        const writes: Array<{ readonly level: LogLevel; readonly text: string }> = messagesForLogger.flatMap(
          (message) => {
            const level = prepareMessage(message)
            return level === 'none' ? [] : [{ level, text: messageTextOf(message) }]
          },
        )
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
