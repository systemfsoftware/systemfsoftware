import { it } from '@effect/vitest'
import { Match, Option, Record } from 'effect'
import * as Result from 'effect/Result'

import {
  type ReportingRule,
  RouteExtractorMessage,
  routeExtractorMessage,
  type RoutingDecision,
} from '../collector/route-extractor-message.workflow.js'

const destinationOf = (decision: RoutingDecision): string =>
  Match.value(decision).pipe(
    Match.tag('RoutedToReport', () => 'report'),
    Match.tag('RoutedToConsole', ({ level }) => `console-${level}`),
    Match.tag('RoutedSuppressed', () => 'console-none'),
    Match.exhaustive,
  )

const familyDefaultOf = (command: RouteExtractorMessage): ReportingRule =>
  Match.value(command.category).pipe(
    Match.when('Compiler', () => command.rules.compilerDefault),
    Match.when('Extractor', () => command.rules.extractorDefault),
    Match.when('TSDoc', () => command.rules.tsdocDefault),
    Match.when('console', () => command.rules.compilerDefault),
    Match.exhaustive,
  )

const ruleFor = (command: RouteExtractorMessage): ReportingRule =>
  Option.getOrElse(Record.get(command.rules.byMessageId, command.messageId), () => familyDefaultOf(command))

const levelDestinationOf = (level: ReportingRule['logLevel']): string =>
  Match.value(level).pipe(
    Match.when('none', () => 'console-none'),
    Match.when('error', () => 'console-error'),
    Match.when('warning', () => 'console-warning'),
    Match.exhaustive,
  )

const referenceDestination = (command: RouteExtractorMessage): string =>
  Match.value(command.category).pipe(
    Match.when('console', () =>
      `console-${Option.getOrElse(Option.fromNullishOr(command.logLevel), () => 'none' as const)}`),
    Match.orElse(() =>
      Match.value(ruleFor(command).addToApiReportFile && command.reportEnabled).pipe(
        Match.when(true, () =>
          'report'),
        Match.when(false, () => levelDestinationOf(ruleFor(command).logLevel)),
        Match.exhaustive,
      )
    ),
  )

it.prop(
  '∀cmd_Routing_≡RuleLookup',
  { of: [RouteExtractorMessage], subject: routeExtractorMessage },
  (subject, [command]) => destinationOf(subject(command).pipe(Result.merge)) === referenceDestination(command),
)
