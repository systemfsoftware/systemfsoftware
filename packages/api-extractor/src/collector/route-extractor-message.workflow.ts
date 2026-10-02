import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { MessageLogLevel } from '../config/config-file.schema.js'
import { LogLevel } from './message-router.schema.js'

/** A rule as the router holds it: every optional config field already resolved. */
export const ReportingRule = Schema.Struct({
  logLevel: MessageLogLevel,
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

/** A console line: the level stated at the call site, and nothing to look up. */
export const ConsoleRoute = Schema.TaggedStruct('Console', { logLevel: LogLevel })

/** A compiler/extractor/tsdoc message: its family is what the reporting rules are looked up by. */
export const CompilerRoute = Schema.TaggedStruct('Compiler', {})
export const ExtractorRoute = Schema.TaggedStruct('Extractor', {})
export const TsdocRoute = Schema.TaggedStruct('TSDoc', {})

/**
 * What kind of message is being routed. A console line carries the level it was emitted at;
 * a family message carries nothing but its tag, because its level comes from the rules table.
 */
export const RouteSubject = Schema.Union([ConsoleRoute, CompilerRoute, ExtractorRoute, TsdocRoute])
export type RouteSubject = typeof RouteSubject.Type

/**
 * The routing question for one message: who it is (`subject`, and for a console line the level
 * stated at the call site), the rule table being applied, and whether an API report is being
 * written at all.
 */
export class RouteExtractorMessage extends Schema.TaggedClass<RouteExtractorMessage>()('RouteExtractorMessage', {
  subject: RouteSubject,
  messageId: Schema.String,
  rules: MessageReportingRules,
  reportEnabled: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
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

export const RoutingDecision = Schema.Union([RoutedToReport, RoutedToConsole, RoutedSuppressed])
export type RoutingDecision = typeof RoutingDecision.Type

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
  Match.value(command.subject).pipe(
    Match.tag('Console', () => command.rules.compilerDefault),
    Match.tag('Compiler', () => command.rules.compilerDefault),
    Match.tag('Extractor', () => command.rules.extractorDefault),
    Match.tag('TSDoc', () => command.rules.tsdocDefault),
    Match.exhaustive,
  )

const ruleFor = (command: RouteExtractorMessage): ReportingRule =>
  Option.getOrElse(Record.get(command.rules.byMessageId, command.messageId), () => defaultRuleFor(command))

const routeCommand = (command: RouteExtractorMessage): RoutingDecision =>
  Match.value(command.subject).pipe(
    Match.tag('Console', (subject) => RoutedToConsole.make({ level: subject.logLevel })),
    Match.tag('Compiler', () => ruleRouting(command, ruleFor(command))),
    Match.tag('Extractor', () => ruleRouting(command, ruleFor(command))),
    Match.tag('TSDoc', () => ruleRouting(command, ruleFor(command))),
    Match.exhaustive,
  )

export const routeExtractorMessage = Workflow.make({
  command: RouteExtractorMessage,
  decision: RoutingDecision,
  error: Schema.Never,
  decide: (command: RouteExtractorMessage): Result.Result<RoutingDecision, never> =>
    Result.succeed(routeCommand(command)),
})
