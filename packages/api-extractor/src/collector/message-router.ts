import { Match, Option, Result } from 'effect'

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

const messageViewOf = (request: MessageViewRequest, rules: MessageReportingRules): MessageView => {
  const decisionOf = (message: ExtractorMessage): RoutingDecision =>
    Result.merge(routeExtractorMessage(commandOf(message, rules, request.reportEnabled)))

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

  const candidatesOf = (messages: readonly ExtractorMessage[]): readonly ReportCandidate[] =>
    messages.map((message) => ({ message, decision: decisionOf(message), consumed: message.handled }))

  const consumed = (selected: ExtractorMessage[]): readonly ExtractorMessage[] => {
    sortMessagesForOutput(selected)
    selected.forEach((message) => message.markHandled())
    return selected
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

  const pendingNonConsole = (): ExtractorMessage[] => {
    const pending = request.log.messages().filter((message) => message.category !== 'console' && !message.handled)
    sortMessagesForOutput(pending)
    return pending
  }

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
