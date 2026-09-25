import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import { AwaitCondition } from './AwaitCondition.schema.js'
import { EvaluateProbe, evaluateProbe, ProbeVerdict } from './evaluate-probe.workflow.js'
import { HostProber } from './host-prober.service.js'
import { LogSource } from './log-source.service.js'
import type { LogSourceError } from './ReadinessError.schema.js'
import { ProbeInputInvalid } from './ReadinessError.schema.js'
import { ResolveProbe, resolveProbe } from './resolve-probe.workflow.js'

type ProbeRequirements = HostProber | LogSource

const readResolve = (command: AwaitCondition): Effect.Effect<ResolveProbe> =>
  Effect.succeed(new ResolveProbe({ target: command.target, condition: command.condition }))

const resolveProbeCell = Sandwich.named('probe_condition_resolve')(readResolve)
  .decide(resolveProbe)
  .write({
    ProbeAbsent: (_plan, command): Effect.Effect<EvaluateProbe, LogSourceError, ProbeRequirements> =>
      Effect.succeed(new EvaluateProbe({ condition: command.condition, evidence: { _tag: 'Absent' } })),
    ProbeTcp: (plan, command): Effect.Effect<EvaluateProbe, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(HostProber, (prober) => prober.dial(plan.binding)),
        (evidence) => new EvaluateProbe({ condition: command.condition, evidence }),
      ),
    ProbeHttp: (plan, command): Effect.Effect<EvaluateProbe, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(HostProber, (prober) => prober.exchange(plan.binding, plan.path)),
        (evidence) => new EvaluateProbe({ condition: command.condition, evidence }),
      ),
    ProbeLog: (_plan, command): Effect.Effect<EvaluateProbe, LogSourceError, ProbeRequirements> =>
      Effect.map(
        Effect.flatMap(LogSource, (source) => source.entries),
        (entries) => new EvaluateProbe({ condition: command.condition, evidence: { _tag: 'LogEntries', entries } }),
      ),
    CommandRejected: (rejected): Effect.Effect<never, ProbeInputInvalid> =>
      Effect.fail(new ProbeInputInvalid({ issue: rejected.issue })),
  })

const readEvaluate = (command: EvaluateProbe): Effect.Effect<EvaluateProbe> => Effect.succeed(command)

const evaluateProbeCell = Sandwich.named('probe_condition')(readEvaluate)
  .decide(evaluateProbe)
  .write({
    Satisfied: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    NotYet: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    CommandRejected: (rejected): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> =>
      Effect.fail(new ProbeInputInvalid({ issue: rejected.issue })),
  })

export const probeConditionCell = resolveProbeCell.pipe(Cell.andThen(evaluateProbeCell))
