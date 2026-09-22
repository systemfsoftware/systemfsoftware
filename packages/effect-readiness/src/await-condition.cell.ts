import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Schedule } from 'effect'
import * as Result from 'effect/Result'
import { AwaitCondition } from './AwaitCondition.schema.js'
import { EvaluateProbe, evaluateProbe } from './evaluate-probe.workflow.js'
import { HostProber } from './HostProber.js'
import { LogSource } from './LogSource.js'
import { ProbeEvidence } from './ProbeEvidence.schema.js'
import type { LogSourceError } from './ReadinessError.schema.js'
import { ResolveProbe, resolveProbe } from './resolve-probe.workflow.js'
import type { ProbePlan } from './resolve-probe.workflow.js'
import { Satisfied, TimedOut } from './verdict.schema.js'

type ProbeRequirements = HostProber | LogSource

const evidenceOf = (plan: ProbePlan): Effect.Effect<ProbeEvidence, LogSourceError, ProbeRequirements> =>
  Match.value(plan).pipe(
    Match.tag('ProbeAbsent', () => Effect.succeed<ProbeEvidence>({ _tag: 'Absent' })),
    Match.tag('ProbeTcp', (tcp) => Effect.flatMap(HostProber, (prober) => prober.dial(tcp.binding))),
    Match.tag('ProbeHttp', (http) => Effect.flatMap(HostProber, (prober) => prober.exchange(http.binding, http.path))),
    Match.tag('ProbeLog', () =>
      Effect.flatMap(
        LogSource,
        (source) => Effect.map(source.entries, (entries): ProbeEvidence => ({ _tag: 'LogEntries', entries })),
      )),
    Match.exhaustive,
  )

const satisfiedOnce = (
  plan: ProbePlan,
  command: AwaitCondition,
): Effect.Effect<boolean, LogSourceError, ProbeRequirements> =>
  Effect.map(
    evidenceOf(plan),
    (evidence) => Result.getOrThrow(evaluateProbe(new EvaluateProbe({ condition: command.condition, evidence }))),
  )

const pollUntilSatisfied = (
  plan: ProbePlan,
  command: AwaitCondition,
): Effect.Effect<Satisfied | TimedOut, LogSourceError, ProbeRequirements> =>
  Effect.timeoutOrElse(
    Effect.map(
      Effect.repeat(satisfiedOnce(plan, command), {
        schedule: Schedule.spaced(`${command.target.pollMs} millis`),
        until: (satisfied) => satisfied,
      }),
      () => new Satisfied({}),
    ),
    {
      duration: `${command.target.timeoutMs} millis`,
      orElse: () => Effect.succeed<Satisfied | TimedOut>(new TimedOut({})),
    },
  )

const readCommand = (command: AwaitCondition): Effect.Effect<AwaitCondition> => Effect.succeed(command)

const decodeCommand = Sandwich.pure((command: AwaitCondition) =>
  Result.succeed(new ResolveProbe({ target: command.target, condition: command.condition }))
)

const writeVerdict = (
  outcome: Result.Result<ProbePlan, never>,
  command: AwaitCondition,
): Effect.Effect<Satisfied | TimedOut, LogSourceError, ProbeRequirements> =>
  pollUntilSatisfied(Result.getOrThrow(outcome), command)

export const awaitConditionCell = Sandwich.named('await_condition')(readCommand)
  .decode(decodeCommand)
  .decide(resolveProbe)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeVerdict)
