import { it } from '@effect/vitest'
import { Effect, Match, Result, Schema } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'

import { ConsoleMessageId, ExtractorMessage, MessageLog } from '../collector/message-log.js'
import { makeMessageRouter } from '../collector/message-router.js'
import {
  ExtractorMessageCategorySchema,
  LogLevel,
  type LogLevel as LogLevelValue,
} from '../collector/message-router.schema.js'
import {
  type ReportingRule,
  RouteExtractorMessage,
  routeExtractorMessage,
  type RoutingDecision,
} from '../collector/route-extractor-message.workflow.js'
import { Verbosity } from '../collector/verbosity.schema.js'
import { MessageWriter } from '../message-writer.service.js'

const RuleLevel = Schema.Literals(['error', 'warning', 'none'])
const ConfigRule = Schema.Struct({
  logLevel: RuleLevel,
  addToApiReportFile: Schema.Boolean,
})

const MessageId = Schema.Literals([
  'ae-forgotten-export',
  'ae-internal-missing-underscore',
  'TS1234',
  'TS9999',
  'tsdoc-missing-release-tag',
  'tsdoc-undefined-token',
])

interface RuleTable {
  readonly byMessageId: Record<string, ReportingRule>
  readonly compilerDefault: ReportingRule
  readonly extractorDefault: ReportingRule
  readonly tsdocDefault: ReportingRule
}

const referenceDestination = (
  category: 'Compiler' | 'TSDoc' | 'Extractor' | 'console',
  messageId: string,
  consoleLevel: LogLevelValue,
  table: RuleTable,
  reportEnabled: boolean,
): string => {
  if (category === 'console') {
    return `console-${consoleLevel}`
  }
  const rule = table.byMessageId[messageId] ??
    (category === 'Compiler'
      ? table.compilerDefault
      : category === 'Extractor'
      ? table.extractorDefault
      : table.tsdocDefault)
  if (rule.addToApiReportFile && reportEnabled) {
    return 'report'
  }
  return `console-${rule.logLevel}`
}

const destinationOf = (decision: RoutingDecision): string =>
  Match.value(decision).pipe(
    Match.tag('RoutedToReport', () => 'report'),
    Match.tag('RoutedToConsole', ({ level }) => `console-${level}`),
    Match.tag('RoutedSuppressed', () => 'console-none'),
    Match.exhaustive,
  )

const ruleArb = Arbitrary.schema(ConfigRule)
const boolArb = Arbitrary.schema(Schema.Boolean)
const levelArb = Arbitrary.schema(LogLevel)
const categoryArb = Arbitrary.schema(ExtractorMessageCategorySchema)
const messageIdArb = Arbitrary.schema(MessageId)

const RoutingCase = Arbitrary.map(
  Arbitrary.all([categoryArb, messageIdArb, ruleArb, ruleArb, ruleArb, ruleArb, levelArb, boolArb]),
  ([category, messageId, rule, compilerDefault, extractorDefault, tsdocDefault, consoleLevel, reportEnabled]) => ({
    command: RouteExtractorMessage.make({
      category,
      messageId,
      logLevel: consoleLevel,
      rules: { byMessageId: { [messageId]: rule }, compilerDefault, extractorDefault, tsdocDefault },
      reportEnabled,
    }),
    category,
    messageId,
    consoleLevel,
    table: { byMessageId: { [messageId]: rule }, compilerDefault, extractorDefault, tsdocDefault },
    reportEnabled,
  }),
)

it.prop(
  '∀id_Routing_≡UpstreamRuleLookup',
  [RoutingCase],
  ([c]) =>
    destinationOf(Result.getOrThrow(routeExtractorMessage(c.command))) ===
      referenceDestination(c.category, c.messageId, c.consoleLevel, c.table, c.reportEnabled),
)

const MessageCase = Arbitrary.map(
  Arbitrary.all([categoryArb, messageIdArb, levelArb]),
  ([category, messageId, logLevel]) => ({ category, messageId, logLevel }),
)

interface ScenarioRules {
  readonly aeRule: ReportingRule
  readonly tsRule: ReportingRule
  readonly tsdocRule: ReportingRule
  readonly extractorDefault: ReportingRule
  readonly compilerDefault: ReportingRule
  readonly tsdocDefault: ReportingRule
}

const tableOf = (rules: ScenarioRules): RuleTable => ({
  byMessageId: {
    'ae-forgotten-export': rules.aeRule,
    TS9999: rules.tsRule,
    'tsdoc-missing-release-tag': rules.tsdocRule,
  },
  extractorDefault: rules.extractorDefault,
  compilerDefault: rules.compilerDefault,
  tsdocDefault: rules.tsdocDefault,
})

const messagesConfigOf = (rules: ScenarioRules) => ({
  compilerMessageReporting: { TS9999: rules.tsRule, default: rules.compilerDefault },
  extractorMessageReporting: { 'ae-forgotten-export': rules.aeRule, default: rules.extractorDefault },
  tsdocMessageReporting: { 'tsdoc-missing-release-tag': rules.tsdocRule, default: rules.tsdocDefault },
})

const ResidueScenario = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.array(MessageCase, { maxLength: 5 }),
    ruleArb,
    ruleArb,
    ruleArb,
    ruleArb,
    ruleArb,
    ruleArb,
    boolArb,
  ]),
  ([messages, aeRule, tsRule, tsdocRule, extractorDefault, compilerDefault, tsdocDefault, reportEnabled]) => ({
    messages,
    rules: { aeRule, tsRule, tsdocRule, extractorDefault, compilerDefault, tsdocDefault },
    reportEnabled,
  }),
)

it.effect.prop('∀log_ReportRouted_∉Residue', [ResidueScenario], ([scenario]) =>
  Effect.gen(function*() {
    const lines: Array<{ readonly level: LogLevelValue; readonly text: string }> = []
    const table = tableOf(scenario.rules)
    const router = yield* makeMessageRouter(
      { cliFlags: { verbose: true }, configQuiet: false },
      { messagesConfig: messagesConfigOf(scenario.rules), reportEnabled: scenario.reportEnabled },
    ).pipe(
      Effect.provideService(MessageWriter, {
        write: (level, text) =>
          Effect.sync(() => {
            lines.push({ level, text })
          }),
      }),
    )
    const log = router.messageLog
    scenario.messages.forEach((message, index) => {
      const text = `message-${index}`
      log.append(
        message.category === 'console'
          ? new ExtractorMessage({
            category: message.category,
            messageId: message.messageId,
            text,
            logLevel: message.logLevel,
          })
          : new ExtractorMessage({ category: message.category, messageId: message.messageId, text }),
      )
    })

    router.fetchUnassociatedMessagesForReviewFile()
    yield* router.emitAnalysisConsoleMessages
    yield* router.handleRemainingNonConsoleMessages

    const prefixOf = (level: string): string => level === 'error' ? 'Error: ' : level === 'warning' ? 'Warning: ' : ''
    const occurrencesOfText = (text: string): number => lines.filter((line) => line.text.includes(text)).length
    const expectedTextFor = (index: number): string =>
      scenario.messages[index]!.category === 'console'
        ? `message-${index}`
        : `(${scenario.messages[index]!.messageId}) message-${index}`

    const destinationOfMessage = (index: number): string =>
      referenceDestination(
        scenario.messages[index]!.category,
        scenario.messages[index]!.messageId,
        scenario.messages[index]!.logLevel,
        table,
        scenario.reportEnabled,
      )
    const eachMessageInExactlyOneBucket = scenario.messages.every((_, index) => {
      const destination = destinationOfMessage(index)
      const text = `message-${index}`
      if (destination === 'report' || destination === 'console-none') {
        return occurrencesOfText(text) === 0
      }
      const level = destination.slice('console-'.length)
      const printed = prefixOf(level) + expectedTextFor(index)
      return (
        occurrencesOfText(text) === 1 &&
        lines.some((line) => line.text === printed && line.level === level)
      )
    })
    const countOfDestination = (destination: string): number =>
      scenario.messages.filter((_, index) => destinationOfMessage(index) === destination).length

    return (
      eachMessageInExactlyOneBucket &&
      router.errorCount() === countOfDestination('console-error') &&
      router.warningCount() === countOfDestination('console-warning')
    )
  }))

it.prop('∀v_MessageLogDiagnostics_≡DiagnosticsMode', [Verbosity, Schema.String], ([verbosity, text]) => {
  const log = new MessageLog({ diagnostics: verbosity === 'diagnostics' })
  log.addDiagnostic(text)
  log.addConsoleMessage(ConsoleMessageId.Preamble, 'info', text)
  return log.messages().length === (verbosity === 'diagnostics' ? 2 : 1)
})
