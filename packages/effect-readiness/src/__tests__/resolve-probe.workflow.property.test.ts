import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import type { Condition } from '../Condition.schema.js'
import { PortNumber } from '../Port.schema.js'
import { ProbeTarget } from '../ProbeTarget.schema.js'
import { type ProbePlan, ResolveProbe, resolveProbe } from '../resolve-probe.workflow.js'

const planOf = (resolve: typeof resolveProbe, target: ProbeTarget, condition: Condition): ProbePlan =>
  Result.getOrThrow(resolve(new ResolveProbe({ target, condition })))

const isBound = (target: ProbeTarget, guestPort: number): boolean =>
  target.bindings.some((binding) => binding.guest === guestPort)

const portPlanLaw = (plan: ProbePlan, guestPort: number, bound: boolean): boolean =>
  Match.value(plan).pipe(
    Match.tag('ProbeAbsent', (absent) => !bound && absent.guestPort === guestPort),
    Match.tag('ProbeTcp', (tcp) => bound && tcp.binding.guest === guestPort),
    Match.tag('ProbeHttp', (http) => bound && http.binding.guest === guestPort),
    Match.orElse(() => false),
  )

it.prop(
  '∀t_TcpCondition_≡Binding',
  { of: [ProbeTarget, PortNumber], subject: resolveProbe },
  (resolve, [target, guestPort]) =>
    portPlanLaw(planOf(resolve, target, { _tag: 'Tcp', guestPort }), guestPort, isBound(target, guestPort)),
)

it.prop(
  '∀t_HttpCondition_≡Path',
  { of: [ProbeTarget, PortNumber, Schema.String], subject: resolveProbe },
  (resolve, [target, guestPort, path]) =>
    Match.value(planOf(resolve, target, { _tag: 'Http', guestPort, path })).pipe(
      Match.tag('ProbeAbsent', (absent) => !isBound(target, guestPort) && absent.guestPort === guestPort),
      Match.tag(
        'ProbeHttp',
        (plan) => isBound(target, guestPort) && plan.binding.guest === guestPort && plan.path === path,
      ),
      Match.orElse(() => false),
    ),
)

it.prop(
  '∀t_LogCondition_=ProbeLog',
  { of: [ProbeTarget, Schema.String], subject: resolveProbe },
  (resolve, [target, pattern]) =>
    Match.value(planOf(resolve, target, { _tag: 'Log', pattern })).pipe(
      Match.tag('ProbeLog', (plan) => plan.pattern === pattern),
      Match.orElse(() => false),
    ),
)
