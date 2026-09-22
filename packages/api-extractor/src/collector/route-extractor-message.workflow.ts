import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { ExtractorMessageCategorySchema, LogLevel } from './message-router.schema.js'

/** A rule as the router holds it: every optional config field already resolved. */
export const ReportingRule = Schema.Struct({
  logLevel: Schema.Literals(['error', 'warning', 'none'] as const),
  addToApiReportFile: Schema.Boolean,
})
export type ReportingRule = typeof ReportingRule.Type

/** The normalized `messages` config: per-id rules plus the per-family defaults. */
export const MessageReportingRules = Schema.Struct({
  byMessageId: Schema.Record(Schema.String, ReportingRule),
  compilerDefault: ReportingRule,
  extractorDefault: ReportingRule,
  tsdocDefault: ReportingRule,
})
export type MessageReportingRules = typeof MessageReportingRules.Type

const RoutingDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/RoutingDecision')
type RoutingDecisionTypeId = typeof RoutingDecisionTypeId

/**
 * The routing question for one message: who it is (`category`, `messageId`, and
 * for a console line the level stated at the call site), the rule table being
 * applied, and whether an API report is being written at all.
 */
export class RouteExtractorMessage extends Schema.TaggedClass<RouteExtractorMessage>()('RouteExtractorMessage', {
  category: ExtractorMessageCategorySchema,
  messageId: Schema.String,
  logLevel: Schema.optional(LogLevel),
  rules: MessageReportingRules,
  reportEnabled: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

/** The message is consumed by the API report and never reaches the console. */
export class RoutedToReport extends Schema.TaggedClass<RoutedToReport>()('RoutedToReport', {}) {
  readonly [RoutingDecisionTypeId] = RoutingDecisionTypeId
}

/** The message reaches the console at this level, subject to verbosity admission. */
export class RoutedToConsole extends Schema.TaggedClass<RoutedToConsole>()('RoutedToConsole', {
  level: LogLevel,
}) {
  readonly [RoutingDecisionTypeId] = RoutingDecisionTypeId
}

/** The message is recorded but reaches neither the report nor the console. */
export class RoutedSuppressed extends Schema.TaggedClass<RoutedSuppressed>()('RoutedSuppressed', {}) {
  readonly [RoutingDecisionTypeId] = RoutingDecisionTypeId
}

export type RoutingDecision = RoutedToReport | RoutedToConsole | RoutedSuppressed

const levelOrNone = (command: RouteExtractorMessage) =>
  Option.getOrElse(Option.fromNullishOr(command.logLevel), () => 'none' as const)

const levelRouting = (level: ReportingRule['logLevel']): RoutingDecision =>
  Match.value(level).pipe(
    Match.when('none', () => RoutedSuppressed.make()),
    Match.when('error', () => RoutedToConsole.make({ level: 'error' })),
    Match.when('warning', () => RoutedToConsole.make({ level: 'warning' })),
    Match.exhaustive,
  )

const reportRouting = (command: RouteExtractorMessage, rule: ReportingRule): RoutingDecision =>
  Match.value(command.reportEnabled).pipe(
    Match.when(true, () => RoutedToReport.make()),
    Match.when(false, () => levelRouting(rule.logLevel)),
    Match.exhaustive,
  )

const ruleRouting = (command: RouteExtractorMessage, rule: ReportingRule): RoutingDecision =>
  Match.value(rule.addToApiReportFile).pipe(
    Match.when(true, () => reportRouting(command, rule)),
    Match.when(false, () => levelRouting(rule.logLevel)),
    Match.exhaustive,
  )

const defaultRuleFor = (command: RouteExtractorMessage): ReportingRule =>
  Match.value(command.category).pipe(
    Match.when('Compiler', () => command.rules.compilerDefault),
    Match.when('Extractor', () => command.rules.extractorDefault),
    Match.when('TSDoc', () => command.rules.tsdocDefault),
    Match.when('console', () => command.rules.compilerDefault),
    Match.exhaustive,
  )

const ruleFor = (command: RouteExtractorMessage): ReportingRule =>
  Option.getOrElse(
    Option.fromNullishOr(command.rules.byMessageId[command.messageId]),
    () => defaultRuleFor(command),
  )

const routeCommand = (command: RouteExtractorMessage): RoutingDecision =>
  Match.value(command.category).pipe(
    Match.when('console', () => RoutedToConsole.make({ level: levelOrNone(command) })),
    Match.when('Compiler', () => ruleRouting(command, ruleFor(command))),
    Match.when('Extractor', () => ruleRouting(command, ruleFor(command))),
    Match.when('TSDoc', () => ruleRouting(command, ruleFor(command))),
    Match.exhaustive,
  )

export const routeExtractorMessage = Workflow.total(
  RouteExtractorMessage,
  (command: RouteExtractorMessage): Result.Result<RoutingDecision, never> => Result.succeed(routeCommand(command)),
)
