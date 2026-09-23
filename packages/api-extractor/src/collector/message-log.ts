import type * as tsdoc from '@microsoft/tsdoc'
import { Data } from 'effect'
import * as Match from 'effect/Match'
import * as Pipeable from 'effect/Pipeable'
import * as Ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { AstSymbol } from '../analyzer/AstSymbol.js'
import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import type { ExtractorMessageId } from './extractor-message-id.js'
import type { ExtractorMessageCategory, LogLevel } from './message-router.schema.js'
import type { RoutingDecision } from './route-extractor-message.workflow.js'
import type { SourceMapper } from './SourceMapper.js'

export interface ExtractorMessageProperties {
  readonly exportName?: string
}

export interface ExtractorMessageProps {
  readonly category: ExtractorMessageCategory
  readonly messageId: string
  readonly text: string
  readonly sourceFilePath?: string | undefined
  readonly sourceFileLine?: number | undefined
  readonly sourceFileColumn?: number | undefined
  readonly properties?: ExtractorMessageProperties | undefined
  readonly logLevel?: LogLevel | undefined
}

export class ExtractorMessage extends Data.Class<ExtractorMessageProps> {
  declare public properties: ExtractorMessageProperties
  declare public logLevel: LogLevel
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

const diagnosticsLine = '='.repeat(60)

export interface MessageLogOptions {
  readonly sourceMapper?: SourceMapper | undefined

  /**
   * Whether the run records its diagnostics listings at all. Analysis consults
   * this before walking file lists that only exist to be printed under
   * `--diagnostics`; the recorded lines are console output like any other.
   */
  readonly diagnostics: boolean
}

/**
 * The per-run record of every message analysis produces, in insertion order:
 * compiler diagnostics, analyzer issues, TSDoc parser messages, and the console
 * lines analysis emits. Recording is synchronous and appends only; routing the
 * recorded messages to the report, a console level, or suppression happens later
 * through `routeExtractorMessage`, never here.
 */
export class MessageLog extends Pipeable.Class {
  readonly #sourceMapper: SourceMapper | undefined
  readonly diagnostics: boolean

  readonly #messages: ExtractorMessage[] = []
  readonly #associatedMessagesByDeclaration: Map<AstDeclaration, ExtractorMessage[]> = new Map()

  public constructor(options: MessageLogOptions) {
    super()
    this.#sourceMapper = options.sourceMapper
    this.diagnostics = options.diagnostics
  }

  public messages(): readonly ExtractorMessage[] {
    return this.#messages
  }

  public associatedMessagesOf(astDeclaration: AstDeclaration): readonly ExtractorMessage[] {
    return this.#associatedMessagesByDeclaration.get(astDeclaration) ?? []
  }

  public append(message: ExtractorMessage): ExtractorMessage {
    this.#messages.push(message)
    return message
  }

  public addCompilerDiagnostic(diagnostic: Ts.Diagnostic): void {
    if (
      diagnostic.category === Ts.DiagnosticCategory.Suggestion ||
      diagnostic.category === Ts.DiagnosticCategory.Message
    ) {
      return
    }
    const message = this.append(
      new ExtractorMessage({
        category: 'Compiler',
        messageId: `TS${diagnostic.code}`,
        text: Ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      }),
    )
    if (diagnostic.file !== undefined) {
      const sourceLocation = this.#sourceMapper?.getSourceLocation({
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
  }

  public addAnalyzerIssueForPosition(
    messageId: ExtractorMessageId | string,
    messageText: string,
    sourceFile: Ts.SourceFile,
    pos: number,
    properties?: ExtractorMessageProperties,
  ): ExtractorMessage {
    const sourceLocation = this.#sourceMapper?.getSourceLocation({ sourceFile, pos })
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
    return this.append(
      new ExtractorMessage({
        category: 'Extractor',
        messageId,
        text: messageText,
        properties,
        sourceFilePath: sourceLocation?.sourceFilePath ?? sourceFile.fileName,
        sourceFileLine: sourceLocation?.sourceFileLine ?? line + 1,
        sourceFileColumn: sourceLocation?.sourceFileColumn ?? character + 1,
      }),
    )
  }

  public addAnalyzerIssue(
    messageId: ExtractorMessageId | string,
    messageText: string,
    astDeclarationOrSymbol: AstDeclaration | AstSymbol,
    properties?: ExtractorMessageProperties,
  ): void {
    const astDeclaration = astDeclarationOrSymbol instanceof AstDeclaration
      ? astDeclarationOrSymbol
      : astDeclarationOrSymbol.astDeclarations[0]
    if (astDeclaration === undefined) {
      return
    }
    const message = this.addAnalyzerIssueForPosition(
      messageId,
      messageText,
      astDeclaration.declaration.getSourceFile(),
      astDeclaration.declaration.getStart(),
      properties,
    )
    this.#associateMessageWithAstDeclaration(message, astDeclaration)
  }

  public addTsdocMessages(
    parserContext: tsdoc.ParserContext,
    sourceFile: Ts.SourceFile,
    astDeclaration?: AstDeclaration,
  ): void {
    for (const message of parserContext.log.messages) {
      const sourceLocation = this.#sourceMapper?.getSourceLocation({ sourceFile, pos: message.textRange.pos })
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(message.textRange.pos)
      const extractorMessage = this.append(
        new ExtractorMessage({
          category: 'TSDoc',
          messageId: message.messageId,
          text: message.unformattedText,
          sourceFilePath: sourceLocation?.sourceFilePath ?? sourceFile.fileName,
          sourceFileLine: sourceLocation?.sourceFileLine ?? line + 1,
          sourceFileColumn: sourceLocation?.sourceFileColumn ?? character + 1,
        }),
      )
      if (astDeclaration !== undefined) {
        this.#associateMessageWithAstDeclaration(extractorMessage, astDeclaration)
      }
    }
  }

  public addConsoleMessage(messageId: string, level: LogLevel, text: string): ExtractorMessage {
    return this.append(
      new ExtractorMessage({
        category: 'console',
        messageId,
        text,
        logLevel: level,
      }),
    )
  }

  public addDiagnostic(text: string): void {
    if (!this.diagnostics) {
      return
    }
    this.addConsoleMessage(ConsoleMessageId.Diagnostics, 'verbose', text)
  }

  public addDiagnosticHeader(title: string): void {
    this.addDiagnostic(diagnosticsLine)
    this.addDiagnostic(`DIAGNOSTIC: ${title}`)
    this.addDiagnostic(diagnosticsLine)
  }

  public addDiagnosticFooter(): void {
    this.addDiagnostic(`${diagnosticsLine}\n`)
  }

  #associateMessageWithAstDeclaration(message: ExtractorMessage, astDeclaration: AstDeclaration): void {
    const associatedMessages = this.#associatedMessagesByDeclaration.get(astDeclaration)
    if (associatedMessages === undefined) {
      this.#associatedMessagesByDeclaration.set(astDeclaration, [message])
    } else {
      associatedMessages.push(message)
    }
  }
}

export interface ReportCandidate {
  readonly message: ExtractorMessage
  readonly decision: RoutingDecision
  readonly consumed: boolean
}

const isRoutedToReport = (decision: RoutingDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('RoutedToReport', () => true),
    Match.tag('RoutedToConsole', () => false),
    Match.tag('RoutedSuppressed', () => false),
    Match.exhaustive,
  )

/**
 * The messages a report variant consumes: not consumed by an earlier variant,
 * and routed to the report. Insertion order; the caller sorts for output.
 */
export const selectReportMessages = (candidates: readonly ReportCandidate[]): ExtractorMessage[] =>
  candidates
    .filter((candidate) => !candidate.consumed && isRoutedToReport(candidate.decision))
    .map((candidate) => candidate.message)
