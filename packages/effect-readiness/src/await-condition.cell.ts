import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Result, Schema } from 'effect'
import { AwaitCondition } from './AwaitCondition.schema.js'
import type { Condition } from './Condition.schema.js'
import { EvaluateProbe, evaluateProbe, ProbeVerdict } from './evaluate-probe.workflow.js'
import { HostProber } from './host-prober.service.js'
import { LogSource } from './log-source.service.js'
import type { ProbeEvidence } from './ProbeEvidence.schema.js'
import type { LogSourceError } from './ReadinessError.schema.js'
import { ProbeInputInvalid } from './ReadinessError.schema.js'
import { ResolveProbe, resolveProbe } from './resolve-probe.workflow.js'

type ProbeRequirements = HostProber | LogSource

type ProbeCommand = (typeof EvaluateProbe)['Encoded']

const evaluateCommandOf = (condition: Condition, evidence: ProbeEvidence): ProbeCommand =>
  Result.getOrThrow(Schema.encodeResult(EvaluateProbe)(new EvaluateProbe({ condition, evidence })))

const readResolve = (command: AwaitCondition): Effect.Effect<ResolveProbe> =>
  Effect.succeed(new ResolveProbe({ target: command.target, condition: command.condition }))

const resolveProbeCell = Sandwich.named('probe_condition_resolve')(readResolve)
  .decide(resolveProbe)
  .write({
    ProbeAbsent: (_plan, command): Effect.Effect<ProbeCommand, LogSourceError, ProbeRequirements> =>
      Effect.succeed(evaluateCommandOf(command.condition, { _tag: 'Absent' })),
    ProbeTcp: (plan, command): Effect.Effect<ProbeCommand, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(HostProber, (prober) => prober.dial(plan.binding)),
        (evidence) => evaluateCommandOf(command.condition, evidence),
      ),
    ProbeHttp: (plan, command): Effect.Effect<ProbeCommand, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(HostProber, (prober) => prober.exchange(plan.binding, plan.path)),
        (evidence) => evaluateCommandOf(command.condition, evidence),
      ),
    ProbeLog: (_plan, command): Effect.Effect<ProbeCommand, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(LogSource, (source) => source.entries),
        (entries) => evaluateCommandOf(command.condition, { _tag: 'LogEntries', entries }),
      ),
    CommandRejected: (rejected): Effect.Effect<never, ProbeInputInvalid> =>
      Effect.fail(new ProbeInputInvalid({ issue: rejected.issue })),
  })

const readEvaluate = (command: ProbeCommand): Effect.Effect<ProbeCommand> => Effect.succeed(command)

const evaluateProbeCell = Sandwich.named('probe_condition')(readEvaluate)
  .decide(evaluateProbe)
  .write({
    Satisfied: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    NotYet: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    CommandRejected: (rejected): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> =>
      Effect.fail(new ProbeInputInvalid({ issue: rejected.issue })),
  })

export const probeConditionCell = resolveProbeCell.pipe(Cell.andThen(evaluateProbeCell))
