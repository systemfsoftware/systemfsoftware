import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'

import type { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { MessageLogLevel, MessageReportingTable, MessagesConfig } from '../config/config-file.schema.js'
import { allExtractorMessageIds } from './extractor-message-id.js'
import type { ExtractorMessage, MessageLog } from './message-log.js'
import { type ReportCandidate, selectReportMessages } from './message-log.js'
import { type ExtractorMessageCategory, LogLevel, MessageRuleError } from './message-router.schema.js'
import {
  type MessageReportingRules,
  type ReportingRule,
  RouteExtractorMessage,
  routeExtractorMessage,
  type RoutingDecision,
} from './route-extractor-message.workflow.js'
import type { Verbosity } from './verbosity.schema.js'

export interface ConsoleLine {
  readonly level: LogLevel
  readonly text: string
}

/**
 * The report-bound messages one report variant may consume. Consumption is
 * recorded on the messages themselves, so a second variant never sees what an
 * earlier variant already rendered.
 */
export interface ReportMessageSource {
  readonly associatedReportMessages: (astDeclaration: AstDeclaration) => readonly ExtractorMessage[]
  readonly unassociatedReportMessages: () => readonly ExtractorMessage[]
}

export interface MessageView extends ReportMessageSource {
  readonly consoleLines: () => readonly ConsoleLine[]
  readonly residue: () => readonly ConsoleLine[]
  readonly errorCount: () => number
  readonly warningCount: () => number
}

export interface MessageViewRequest {
  readonly log: MessageLog
  readonly messagesConfig: MessagesConfig | undefined
  readonly reportEnabled: boolean
  readonly workingPackageFolder: string | undefined
}

const levelLabel: Readonly<Record<LogLevel, string>> = {
  none: '',
  error: 'Error: ',
  warning: 'Warning: ',
  info: '',
  verbose: '',
}

export const formatConsoleLine = (level: LogLevel, text: string): string => levelLabel[level] + text

const isVerboseAdmitted = (v: Verbosity): boolean => v === 'verbose' || v === 'diagnostics'

const levelMatrix: Readonly<Record<LogLevel, (verbosity: Verbosity) => boolean>> = {
  none: () => false,
  error: () => true,
  warning: () => true,
  info: (v) => v !== 'silent',
  verbose: isVerboseAdmitted,
}

export const admits = (verbosity: Verbosity, level: LogLevel): boolean => levelMatrix[level](verbosity)

/**
 * The output order for report-bound and residue messages: by source file, then
 * line, then message id. A message without a source file or line sorts with the
 * empty string and line zero, which is where upstream's comparator placed it.
 * Wave 2 moves this onto the `ExtractorMessage` data module.
 */
export const ExtractorMessageOrder: Order.Order<ExtractorMessage> = Order.combine(
  Order.mapInput(Order.String, (message: ExtractorMessage) => message.sourceFilePath ?? ''),
  Order.combine(
    Order.mapInput(Order.Number, (message: ExtractorMessage) => message.sourceFileLine ?? 0),
    Order.mapInput(Order.String, (message: ExtractorMessage) => message.messageId),
  ),
)

interface RuleSection {
  readonly category: ExtractorMessageCategory
  readonly defaultKey: 'compilerDefault' | 'extractorDefault' | 'tsdocDefault'
  readonly tableKey: 'compilerMessageReporting' | 'extractorMessageReporting' | 'tsdocMessageReporting'
  readonly entries: MessageReportingTable | undefined
  readonly validate: (messageId: string) => Result.Result<void, MessageRuleError>
}

type RuleSectionSpec = Omit<RuleSection, 'entries'>

const normalizeRule = (rule: {
  readonly logLevel: MessageLogLevel
  readonly addToApiReportFile?: boolean | undefined
}): ReportingRule => ({
  logLevel: rule.logLevel,
  addToApiReportFile: rule.addToApiReportFile ?? false,
})

const validateCompilerMessageId = (messageId: string): Result.Result<void, MessageRuleError> =>
  Match.value(/^TS[0-9]+$/.test(messageId)).pipe(
    Match.when(true, (): Result.Result<void, MessageRuleError> => Result.void),
    Match.when(false, (): Result.Result<void, MessageRuleError> =>
      Result.fail(
        new MessageRuleError({
          message: `Error in API Extractor config: The messages.compilerMessageReporting table contains` +
            ` an invalid entry "${messageId}". The identifier format is "TS" followed by an integer.`,
        }),
      )),
    Match.exhaustive,
  )

const validateExtractorMessageId = (messageId: string): Result.Result<void, MessageRuleError> =>
  Match.value(messageId.startsWith('ae-')).pipe(
    Match.when(false, (): Result.Result<void, MessageRuleError> =>
      Result.fail(
        new MessageRuleError({
          message: `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
            ` an invalid entry "${messageId}".  The name should begin with the "ae-" prefix.`,
        }),
      )),
    Match.when(true, (): Result.Result<void, MessageRuleError> =>
      Match.value(allExtractorMessageIds.has(messageId)).pipe(
        Match.when(true, (): Result.Result<void, MessageRuleError> => Result.void),
        Match.when(false, (): Result.Result<void, MessageRuleError> =>
          Result.fail(
            new MessageRuleError({
              message: `Error in API Extractor config: The messages.extractorMessageReporting table contains` +
                ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`,
            }),
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const validateTsdocMessageId = (messageId: string): Result.Result<void, MessageRuleError> =>
  Match.value(messageId.startsWith('tsdoc-')).pipe(
    Match.when(true, (): Result.Result<void, MessageRuleError> => Result.void),
    Match.when(false, (): Result.Result<void, MessageRuleError> =>
      Result.fail(
        new MessageRuleError({
          message: `Error in API Extractor config: The messages.tsdocMessageReporting table contains` +
            ` an invalid entry "${messageId}".  The name should begin with the "tsdoc-" prefix.`,
        }),
      )),
    Match.exhaustive,
  )

const succeededRules = (
  rules: MessageReportingRules,
): Result.Result<MessageReportingRules, MessageRuleError> => Result.succeed(rules)

const sectionSpecs: readonly RuleSectionSpec[] = [
  {
    category: 'Compiler',
    defaultKey: 'compilerDefault',
    tableKey: 'compilerMessageReporting',
    validate: validateCompilerMessageId,
  },
  {
    category: 'Extractor',
    defaultKey: 'extractorDefault',
    tableKey: 'extractorMessageReporting',
    validate: validateExtractorMessageId,
  },
  {
    category: 'TSDoc',
    defaultKey: 'tsdocDefault',
    tableKey: 'tsdocMessageReporting',
    validate: validateTsdocMessageId,
  },
]

const familyEntries = (
  messagesConfig: MessagesConfig | undefined,
  tableKey: RuleSection['tableKey'],
): MessageReportingTable | undefined =>
  Option.match(Option.fromNullishOr(messagesConfig), {
    onNone: () => undefined,
    onSome: (config) => config[tableKey],
  })

const ruleSections = (messagesConfig: MessagesConfig | undefined): readonly RuleSection[] =>
  Arr.map(sectionSpecs, (spec) => ({ ...spec, entries: familyEntries(messagesConfig, spec.tableKey) }))

const applyRuleEntry = (
  section: RuleSection,
  entries: MessageReportingTable,
  table: MessageReportingRules,
  messageId: string,
): Result.Result<MessageReportingRules, MessageRuleError> =>
  Option.match(Option.fromNullishOr(entries[messageId]), {
    onNone: () => Result.succeed(table),
    onSome: (entry) => {
      const reportingRule = normalizeRule(entry)
      return Match.value(messageId).pipe(
        Match.when('default', (): Result.Result<MessageReportingRules, MessageRuleError> =>
          Result.succeed({ ...table, [section.defaultKey]: reportingRule })),
        Match.orElse((): Result.Result<MessageReportingRules, MessageRuleError> =>
          Result.map(section.validate(messageId), () => ({
            ...table,
            byMessageId: { ...table.byMessageId, [messageId]: reportingRule },
          }))),
      )
    },
  })

const applyRuleSection = (
  rules: MessageReportingRules,
  section: RuleSection,
): Result.Result<MessageReportingRules, MessageRuleError> =>
  Option.match(Option.fromNullishOr(section.entries), {
    onNone: () => Result.succeed(rules),
    onSome: (entries) =>
      Arr.reduce(
        Object.getOwnPropertyNames(entries),
        succeededRules(rules),
        (outcome, messageId) => Result.flatMap(outcome, (table) => applyRuleEntry(section, entries, table, messageId)),
      ),
  })

const initialRuleTable = (): MessageReportingRules => ({
  byMessageId: {},
  compilerDefault: { logLevel: 'none', addToApiReportFile: false },
  extractorDefault: { logLevel: 'none', addToApiReportFile: false },
  tsdocDefault: { logLevel: 'none', addToApiReportFile: false },
})

const buildRuleTable = (
  messagesConfig: MessagesConfig | undefined,
): Result.Result<MessageReportingRules, MessageRuleError> =>
  Arr.reduce(
    ruleSections(messagesConfig),
    succeededRules(initialRuleTable()),
    (outcome, section) => Result.flatMap(outcome, (rules) => applyRuleSection(rules, section)),
  )

const commandOf = (
  message: ExtractorMessage,
  rules: MessageReportingRules,
  reportEnabled: boolean,
): RouteExtractorMessage =>
  Match.value(message.category).pipe(
    Match.when('console', (): RouteExtractorMessage =>
      RouteExtractorMessage.make({
        category: message.category,
        messageId: message.messageId,
        logLevel: message.logLevel,
        rules,
        reportEnabled,
      })),
    Match.orElse((): RouteExtractorMessage =>
      RouteExtractorMessage.make({
        category: message.category,
        messageId: message.messageId,
        rules,
        reportEnabled,
      })),
  )

const consoleLevelOf = (decision: RoutingDecision): Option.Option<LogLevel> =>
  Match.value(decision).pipe(
    Match.tag('RoutedToConsole', ({ level }) => Option.some(level)),
    Match.tag('RoutedToReport', () => Option.none<LogLevel>()),
    Match.tag('RoutedSuppressed', () => Option.none<LogLevel>()),
    Match.exhaustive,
  )

const messageViewOf = (request: MessageViewRequest, rules: MessageReportingRules): MessageView => {
  const decisionOf = (message: ExtractorMessage): RoutingDecision =>
    Result.merge(routeExtractorMessage(commandOf(message, rules, request.reportEnabled)))

  const consumedLevelOf = (message: ExtractorMessage): LogLevel =>
    Match.value(message.handled).pipe(
      Match.when(true, (): LogLevel => 'none'),
      Match.when(false, (): LogLevel => Option.getOrElse(consoleLevelOf(decisionOf(message)), () => 'none')),
      Match.exhaustive,
    )

  const analysisLevelOf = (message: ExtractorMessage): LogLevel =>
    Match.value(message.category).pipe(
      Match.when('console', () => message.logLevel),
      Match.when('Compiler', () => consumedLevelOf(message)),
      Match.when('Extractor', () => consumedLevelOf(message)),
      Match.when('TSDoc', () => consumedLevelOf(message)),
      Match.exhaustive,
    )

  const candidatesOf = (messages: readonly ExtractorMessage[]): readonly ReportCandidate[] =>
    messages.map((message) => ({ message, decision: decisionOf(message), consumed: message.handled }))

  const consumed = (selected: readonly ExtractorMessage[]): readonly ExtractorMessage[] => {
    const sorted = Arr.sort(selected, ExtractorMessageOrder)
    Arr.forEach(sorted, (message) => message.markHandled())
    return sorted
  }

  const isUnemittedConsole = (message: ExtractorMessage): boolean => message.category === 'console' && !message.handled

  const consoleLineOf = (message: ExtractorMessage): ConsoleLine => ({
    level: message.logLevel,
    text: message.text,
  })

  const levelLineOf = (message: ExtractorMessage): readonly ConsoleLine[] =>
    Option.match(consoleLevelOf(decisionOf(message)), {
      onNone: () => [],
      onSome: (level) => [{ level, text: message.formatMessageWithLocation(request.workingPackageFolder) }],
    })

  const pendingNonConsole = (): readonly ExtractorMessage[] =>
    Arr.sort(
      request.log.messages().filter((message) => message.category !== 'console' && !message.handled),
      ExtractorMessageOrder,
    )

  const countOfLevel = (level: LogLevel): number =>
    request.log.messages().filter((message) => analysisLevelOf(message) === level).length

  return {
    associatedReportMessages: (astDeclaration) =>
      consumed(selectReportMessages(candidatesOf(request.log.associatedMessagesOf(astDeclaration)))),
    unassociatedReportMessages: () => consumed(selectReportMessages(candidatesOf(request.log.messages()))),
    consoleLines: () => request.log.messages().filter(isUnemittedConsole).map(consoleLineOf),
    residue: () => pendingNonConsole().flatMap(levelLineOf),
    errorCount: () => countOfLevel('error'),
    warningCount: () => countOfLevel('warning'),
  }
}

export const makeMessageView = (
  request: MessageViewRequest,
): Result.Result<MessageView, MessageRuleError> =>
  Result.map(buildRuleTable(request.messagesConfig), (rules) => messageViewOf(request, rules))
