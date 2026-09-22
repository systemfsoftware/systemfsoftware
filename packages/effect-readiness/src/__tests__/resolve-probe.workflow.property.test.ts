import { it } from '@effect/vitest'
import { Match, Option } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from '../Condition.schema.js'
import { ProbeTarget } from '../ProbeTarget.schema.js'
import { type ProbePlan, ResolveProbe, resolveProbe } from '../resolve-probe.workflow.js'

const planOf = (target: ProbeTarget, condition: Condition): ProbePlan =>
  Result.getOrThrow(resolveProbe(new ResolveProbe({ target, condition })))

const guestPortOf = (condition: Condition): Option.Option<number> =>
  Match.value(condition).pipe(
    Match.tag('Tcp', (tcp) => Option.some(tcp.guestPort)),
    Match.tag('Http', (http) => Option.some(http.guestPort)),
    Match.tag('Log', () => Option.none<number>()),
    Match.exhaustive,
  )

const boundPlanLaw = (plan: ProbePlan, guestPort: number, bound: boolean): boolean =>
  Match.value(plan).pipe(
    Match.tag('ProbeAbsent', (absent) => !bound && absent.guestPort === guestPort),
    Match.tag('ProbeTcp', (tcp) => bound && tcp.binding.guest === guestPort),
    Match.tag('ProbeHttp', (http) => bound && http.binding.guest === guestPort),
    Match.orElse(() => false),
  )

it.prop(
  '∀t_ConditionLookup_≡Binding',
  [ProbeTarget, Condition],
  ([target, condition]) =>
    Option.match(guestPortOf(condition), {
      onNone: () => true,
      onSome: (guestPort) =>
        boundPlanLaw(
          planOf(target, condition),
          guestPort,
          target.bindings.some((binding) => binding.guest === guestPort),
        ),
    }),
)

it.prop('∀t_LogCondition_=ProbeLog', [ProbeTarget, Condition], ([target, condition]) =>
  Match.value(condition).pipe(
    Match.tag('Log', (log) =>
      Match.value(planOf(target, log)).pipe(
        Match.tag('ProbeLog', (plan) => plan.pattern === log.pattern),
        Match.orElse(() => false),
      )),
    Match.orElse(() => true),
  ))

it.prop('∀t_HttpCondition_≡Path', [ProbeTarget, Condition], ([target, condition]) =>
  Match.value(condition).pipe(
    Match.tag('Http', (http) =>
      Match.value(planOf(target, http)).pipe(
        Match.tag('ProbeHttp', (plan) => plan.path === http.path),
        Match.orElse(() => true),
      )),
    Match.orElse(() => true),
  ))
