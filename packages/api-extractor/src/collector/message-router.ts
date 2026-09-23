import * as Arr from 'effect/Array'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'

import type { AstDeclaration } from '../analyzer/AstDeclaration.js'
import { getNodeId } from '../analyzer/TypeScriptInternals.js'
import type { MessageLogLevel, MessageReportingTable, MessagesConfig } from '../config/config-file.schema.js'
import { allExtractorMessageIds } from './extractor-message-id.js'
import { ExtractorMessage, type MessageCandidate, MessageLog } from './message-log.js'
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
 * recorded as a set of chunk indices carried between variant renders, so a
 * second variant never sees what an earlier variant already rendered.
 */
export interface ReportMessageSource {
  readonly associatedReportMessages: (
    log: MessageLog,
    astDeclaration: AstDeclaration,
    handled: HashSet.HashSet<number>,
  ) => readonly MessageCandidate[]
  readonly unassociatedReportMessages: (
    log: MessageLog,
    handled: HashSet.HashSet<number>,
  ) => readonly MessageCandidate[]
}

export interface MessageView extends ReportMessageSource {
  readonly consoleLines: (log: MessageLog, handled: HashSet.HashSet<number>) => readonly ConsoleLine[]
  readonly residue: (log: MessageLog, handled: HashSet.HashSet<number>) => readonly ConsoleLine[]
  readonly errorCount: (log: MessageLog, handled: HashSet.HashSet<number>) => number
  readonly warningCount: (log: MessageLog, handled: HashSet.HashSet<number>) => number
}

export interface MessageViewRequest {
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

export interface ReportCandidate extends MessageCandidate {
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

export const selectReportMessages = (candidates: readonly ReportCandidate[]): readonly MessageCandidate[] =>
  Arr.map(
    Arr.filter(candidates, (candidate) => !candidate.consumed && isRoutedToReport(candidate.decision)),
    (candidate) => ({ index: candidate.index, message: candidate.message }),
  )

const candidateOrder: Order.Order<MessageCandidate> = Order.mapInput(
  ExtractorMessage.Order,
  (candidate: MessageCandidate) => candidate.message,
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
    Match.when(
      true,
      (): Result.Result<void, MessageRuleError> =>
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
        ),
    ),
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
          }))
        ),
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
      })
    ),
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

  const reportCandidateOf = (handled: HashSet.HashSet<number>) => (candidate: MessageCandidate): ReportCandidate => ({
    index: candidate.index,
    message: candidate.message,
    decision: decisionOf(candidate.message),
    consumed: HashSet.has(handled, candidate.index),
  })

  const selectedOf =
    (handled: HashSet.HashSet<number>) => (candidates: readonly MessageCandidate[]): readonly MessageCandidate[] =>
      Arr.sort(selectReportMessages(Arr.map(candidates, reportCandidateOf(handled))), candidateOrder)

  const consumedLevelOf = (handled: HashSet.HashSet<number>) => (candidate: MessageCandidate): LogLevel =>
    Match.value(HashSet.has(handled, candidate.index)).pipe(
      Match.when(true, (): LogLevel => 'none'),
      Match.when(false, (): LogLevel => Option.getOrElse(consoleLevelOf(decisionOf(candidate.message)), () => 'none')),
      Match.exhaustive,
    )

  const analysisLevelOf = (handled: HashSet.HashSet<number>) => (candidate: MessageCandidate): LogLevel =>
    Match.value(candidate.message.category).pipe(
      Match.when('console', () => candidate.message.logLevel),
      Match.when('Compiler', () => consumedLevelOf(handled)(candidate)),
      Match.when('Extractor', () => consumedLevelOf(handled)(candidate)),
      Match.when('TSDoc', () => consumedLevelOf(handled)(candidate)),
      Match.exhaustive,
    )

  const isUnemittedConsole = (handled: HashSet.HashSet<number>) => (candidate: MessageCandidate): boolean =>
    candidate.message.category === 'console' && !HashSet.has(handled, candidate.index)

  const consoleLineOf = (message: ExtractorMessage): ConsoleLine => ({
    level: message.logLevel,
    text: message.text,
  })

  const levelLineOf = (message: ExtractorMessage): readonly ConsoleLine[] =>
    Option.match(consoleLevelOf(decisionOf(message)), {
      onNone: () => [],
      onSome: (level) => [{ level, text: message.formatMessageWithLocation(request.workingPackageFolder) }],
    })

  const pendingNonConsole = (log: MessageLog, handled: HashSet.HashSet<number>): readonly ExtractorMessage[] =>
    Arr.sort(
      Arr.map(
        Arr.filter(
          MessageLog.candidates(log),
          (candidate) => candidate.message.category !== 'console' && !HashSet.has(handled, candidate.index),
        ),
        (candidate) => candidate.message,
      ),
      ExtractorMessage.Order,
    )

  const countOfLevel = (log: MessageLog, handled: HashSet.HashSet<number>, level: LogLevel): number =>
    Arr.filter(MessageLog.candidates(log), (candidate) => analysisLevelOf(handled)(candidate) === level).length

  return {
    associatedReportMessages: (log, astDeclaration, handled) =>
      selectedOf(handled)(MessageLog.associatedCandidates(log, getNodeId(astDeclaration.declaration))),
    unassociatedReportMessages: (log, handled) => selectedOf(handled)(MessageLog.candidates(log)),
    consoleLines: (log, handled) =>
      Arr.map(
        Arr.filter(MessageLog.candidates(log), isUnemittedConsole(handled)),
        (candidate) => consoleLineOf(candidate.message),
      ),
    residue: (log, handled) => Arr.flatMap(pendingNonConsole(log, handled), levelLineOf),
    errorCount: (log, handled) => countOfLevel(log, handled, 'error'),
    warningCount: (log, handled) => countOfLevel(log, handled, 'warning'),
  }
}

export const makeMessageView = (
  request: MessageViewRequest,
): Result.Result<MessageView, MessageRuleError> =>
  Result.map(buildRuleTable(request.messagesConfig), (rules) => messageViewOf(request, rules))
