import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Data, HashMap, HashSet } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Ts from 'typescript'

import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import type { NodeId } from '../analyzer/TypeScriptInternals.js'
import type { ExtractorMessageCategory, LogLevel } from './message-router.schema.js'
import { locate, type MessagePosition, type SourceMapIndex } from './SourceMapper.js'

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

export interface ExtractorMessageFields {
  readonly category: ExtractorMessageCategory
  readonly messageId: string
  readonly text: string
  readonly sourceFilePath: string | undefined
  readonly sourceFileLine: number | undefined
  readonly sourceFileColumn: number | undefined
  readonly properties: ExtractorMessageProperties
  readonly logLevel: LogLevel
}

export class ExtractorMessage extends Data.TaggedClass('ExtractorMessage')<ExtractorMessageFields> {
  public static readonly Order: Order.Order<ExtractorMessage> = Order.combine(
    Order.mapInput(Order.String, (message: ExtractorMessage) => message.sourceFilePath ?? ''),
    Order.combine(
      Order.mapInput(Order.Number, (message: ExtractorMessage) => message.sourceFileLine ?? 0),
      Order.mapInput(Order.String, (message: ExtractorMessage) => message.messageId),
    ),
  )

  public formatMessageWithLocation(workingPackageFolderPath: string | undefined): string {
    const locationPrefix = Option.fromNullishOr(this.sourceFilePath).pipe(
      Option.filter((sourceFilePath) => sourceFilePath.length > 0),
      Option.map((sourceFilePath) =>
        SourceFileLocationFormatter.formatPath(sourceFilePath, {
          sourceFileLine: this.sourceFileLine,
          sourceFileColumn: this.sourceFileColumn,
          workingPackageFolderPath,
        })
      ),
      Option.filter((formatted) => formatted.length > 0),
      Option.map((formatted) => `${formatted} - `),
      Option.getOrElse(() => ''),
    )
    return `${locationPrefix}${this.formatMessageWithoutLocation()}`
  }

  public formatMessageWithoutLocation(): string {
    return `(${this.messageId}) ${this.text}`
  }
}

const propertiesOf = (properties: ExtractorMessageProperties | undefined): ExtractorMessageProperties =>
  Option.getOrElse(Option.fromNullishOr(properties), () => ({}))

const logLevelOf = (logLevel: LogLevel | undefined): LogLevel =>
  Option.getOrElse(Option.fromNullishOr(logLevel), () => 'none' as const)

export const makeExtractorMessage = (props: ExtractorMessageProps): ExtractorMessage =>
  new ExtractorMessage({
    category: props.category,
    messageId: props.messageId,
    text: props.text,
    sourceFilePath: props.sourceFilePath,
    sourceFileLine: props.sourceFileLine,
    sourceFileColumn: props.sourceFileColumn,
    properties: propertiesOf(props.properties),
    logLevel: logLevelOf(props.logLevel),
  })

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

/**
 * The per-run record of every message analysis produces, in insertion order. The
 * value is immutable: every append returns a new log, so a message is identified
 * by its chunk index and consumption is recorded as a set of indices.
 */
export interface MessageLog {
  readonly diagnostics: boolean
  readonly messages: Chunk.Chunk<ExtractorMessage>
  readonly associationByDeclaration: HashMap.HashMap<NodeId, Chunk.Chunk<number>>
  readonly handled: HashSet.HashSet<number>
}

export interface MessageLogOptions {
  readonly diagnostics: boolean
}

/** A message paired with its index in the log; the identity consumption uses. */
export interface MessageCandidate {
  readonly index: number
  readonly message: ExtractorMessage
}

/** A message about to be appended, with its position still unlocated. */
export interface LocatedMessage {
  readonly category: ExtractorMessageCategory
  readonly messageId: string
  readonly text: string
  readonly properties: ExtractorMessageProperties | undefined
  readonly logLevel: LogLevel | undefined
  readonly position: Option.Option<MessagePosition>
}

const rawPositionOf = (sourceFile: Ts.SourceFile, pos: number): MessagePosition => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
  return { sourceFilePath: sourceFile.fileName, line: line + 1, column: character + 1 }
}

const locatedFields = (message: LocatedMessage): Partial<ExtractorMessageFields> =>
  Option.match(message.position, {
    onNone: () => ({}),
    onSome: (located) => ({
      sourceFilePath: located.sourceFilePath,
      sourceFileLine: located.line,
      sourceFileColumn: located.column,
    }),
  })

const appendedAt = (log: MessageLog, message: LocatedMessage): MessageLog => ({
  ...log,
  messages: Chunk.append(log.messages, makeExtractorMessage({ ...message, ...locatedFields(message) })),
})

const associated = (log: MessageLog, index: number, declarationId: Option.Option<NodeId>): MessageLog =>
  Option.match(declarationId, {
    onNone: () => log,
    onSome: (id) => ({
      ...log,
      associationByDeclaration: HashMap.modifyAt(
        log.associationByDeclaration,
        id,
        Option.match({
          onNone: () => Option.some(Chunk.of(index)),
          onSome: (indexes) => Option.some(Chunk.append(indexes, index)),
        }),
      ),
    }),
  })

const issueAppended = (
  log: MessageLog,
  messageId: string,
  messageText: string,
  position: MessagePosition | undefined,
  properties: ExtractorMessageProperties | undefined,
): MessageLog =>
  appendedAt(log, {
    category: 'Extractor',
    messageId,
    text: messageText,
    properties,
    logLevel: undefined,
    position: Option.fromNullishOr(position),
  })

const consoleAppended = (log: MessageLog, messageId: string, level: LogLevel, text: string): MessageLog =>
  appendedAt(log, {
    category: 'console',
    messageId,
    text,
    properties: undefined,
    logLevel: level,
    position: Option.none(),
  })

const positionOf = (message: ExtractorMessage): Option.Option<MessagePosition> =>
  Option.flatMap(
    Option.fromNullishOr(message.sourceFilePath),
    (sourceFilePath) =>
      Option.flatMap(Option.fromNullishOr(message.sourceFileLine), (line) =>
        Option.map(Option.fromNullishOr(message.sourceFileColumn), (column) => ({ sourceFilePath, line, column }))),
  )

const relocated = (index: SourceMapIndex) => (message: ExtractorMessage): ExtractorMessage =>
  Match.value(message.category).pipe(
    Match.when('Compiler', () => message),
    Match.orElse(() =>
      Option.match(positionOf(message), {
        onNone: () => message,
        onSome: (raw) =>
          Option.match(locate(index, raw), {
            onNone: () => message,
            onSome: (position) =>
              makeExtractorMessage({
                category: message.category,
                messageId: message.messageId,
                text: message.text,
                properties: message.properties,
                logLevel: message.logLevel,
                sourceFilePath: position.sourceFilePath,
                sourceFileLine: position.line,
                sourceFileColumn: position.column,
              }),
          }),
      })
    ),
  )

export const MessageLog = {
  make: (options: MessageLogOptions): MessageLog => ({
    diagnostics: options.diagnostics,
    messages: Chunk.empty(),
    associationByDeclaration: HashMap.empty(),
    handled: HashSet.empty(),
  }),

  messages: (log: MessageLog): Chunk.Chunk<ExtractorMessage> => log.messages,

  candidates: (log: MessageLog): ReadonlyArray<MessageCandidate> =>
    Arr.map(Chunk.toReadonlyArray(log.messages), (message, index) => ({ index, message })),

  associatedCandidates: (log: MessageLog, declarationId: NodeId): ReadonlyArray<MessageCandidate> =>
    Option.match(HashMap.get(log.associationByDeclaration, declarationId), {
      onNone: () => [],
      onSome: (indexes) =>
        Arr.map(Chunk.toReadonlyArray(indexes), (index) => ({ index, message: Chunk.getUnsafe(log.messages, index) })),
    }),

  isHandled: (log: MessageLog, index: number): boolean => HashSet.has(log.handled, index),

  markHandled: (log: MessageLog, indexes: readonly number[]): MessageLog => ({
    ...log,
    handled: Arr.reduce(indexes, log.handled, (handled, index) => HashSet.add(handled, index)),
  }),

  withHandled: (log: MessageLog, handled: HashSet.HashSet<number>): MessageLog => ({ ...log, handled }),

  /** Maps every raw `.d.ts` position through the pre-read index. Idempotent. */
  locate: (log: MessageLog, index: SourceMapIndex): MessageLog => ({
    ...log,
    messages: Chunk.fromIterable(Arr.map(Chunk.toReadonlyArray(log.messages), relocated(index))),
  }),

  addAnalyzerIssue: (
    log: MessageLog,
    messageId: string,
    messageText: string,
    sourceFile: Ts.SourceFile,
    pos: number,
    declarationId: Option.Option<NodeId>,
    properties?: ExtractorMessageProperties,
  ): MessageLog =>
    associated(
      issueAppended(log, messageId, messageText, rawPositionOf(sourceFile, pos), properties),
      Chunk.size(log.messages),
      declarationId,
    ),

  addAnalyzerIssueForPosition: (
    log: MessageLog,
    messageId: string,
    messageText: string,
    sourceFile: Ts.SourceFile,
    pos: number,
  ): MessageLog => issueAppended(log, messageId, messageText, rawPositionOf(sourceFile, pos), undefined),

  addTsdocMessages: (
    log: MessageLog,
    parserContext: tsdoc.ParserContext,
    sourceFile: Ts.SourceFile,
    declarationId: Option.Option<NodeId>,
  ): MessageLog =>
    Arr.reduce(
      parserContext.log.messages,
      log,
      (accumulated, message) =>
        associated(
          issueAppended(
            accumulated,
            message.messageId,
            message.unformattedText,
            rawPositionOf(sourceFile, message.textRange.pos),
            undefined,
          ),
          Chunk.size(accumulated.messages),
          declarationId,
        ),
    ),

  addCompilerDiagnostic: (log: MessageLog, diagnostic: Ts.Diagnostic): MessageLog =>
    Match.value(
      diagnostic.category === Ts.DiagnosticCategory.Suggestion ||
        diagnostic.category === Ts.DiagnosticCategory.Message,
    ).pipe(
      Match.when(true, () => log),
      Match.orElse(() =>
        appendedAt(log, {
          category: 'Compiler',
          messageId: `TS${diagnostic.code}`,
          text: Ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          properties: undefined,
          logLevel: undefined,
          position: Option.map(Option.fromNullishOr(diagnostic.file), (file) =>
            rawPositionOf(file, diagnostic.start ?? 0)),
        })
      ),
    ),

  addConsoleMessage: consoleAppended,

  addDiagnostic: (log: MessageLog, text: string): MessageLog =>
    Match.value(log.diagnostics).pipe(
      Match.when(true, () => consoleAppended(log, ConsoleMessageId.Diagnostics, 'verbose', text)),
      Match.when(false, () => log),
      Match.exhaustive,
    ),

  addDiagnosticHeader: (log: MessageLog, title: string): MessageLog =>
    MessageLog.addDiagnostic(
      MessageLog.addDiagnostic(MessageLog.addDiagnostic(log, diagnosticsLine), `DIAGNOSTIC: ${title}`),
      diagnosticsLine,
    ),

  addDiagnosticFooter: (log: MessageLog): MessageLog => MessageLog.addDiagnostic(log, `${diagnosticsLine}\n`),
} as const
