import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Match } from 'effect'
import * as Result from 'effect/Result'
import { AwaitCondition } from './AwaitCondition.schema.js'
import { EvaluateProbe, evaluateProbe, ProbeVerdict } from './evaluate-probe.workflow.js'
import { HostProber } from './host-prober.service.js'
import { LogSource } from './log-source.service.js'
import { ProbeEvidence } from './ProbeEvidence.schema.js'
import type { LogSourceError } from './ReadinessError.schema.js'
import { ProbeInputInvalid } from './ReadinessError.schema.js'
import { type ProbePlan, ResolveProbe, resolveProbe } from './resolve-probe.workflow.js'

type ProbeRequirements = HostProber | LogSource

const planOf = (command: AwaitCondition): ProbePlan =>
  Result.getOrThrow(resolveProbe(new ResolveProbe({ target: command.target, condition: command.condition })))

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

/** One pass: pick the probe, gather its evidence, and hand the judge its command. */
const probeOnce = (command: AwaitCondition): Effect.Effect<EvaluateProbe, LogSourceError, ProbeRequirements> =>
  Effect.map(
    evidenceOf(planOf(command)),
    (evidence) => new EvaluateProbe({ condition: command.condition, evidence }),
  )

export const probeConditionCell = Sandwich.named('probe_condition')(probeOnce)
  .decide(evaluateProbe)
  .write({
    Satisfied: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    NotYet: (verdict): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> => Effect.succeed(verdict),
    CommandRejected: (rejected): Effect.Effect<(typeof ProbeVerdict)['Encoded'], ProbeInputInvalid> =>
      Effect.fail(new ProbeInputInvalid({ issue: rejected.issue })),
  })
