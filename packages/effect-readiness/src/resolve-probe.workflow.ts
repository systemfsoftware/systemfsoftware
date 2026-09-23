import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from './Condition.schema.js'
import { PortBinding } from './Port.schema.js'
import { ProbeTarget } from './ProbeTarget.schema.js'

const ProbePlanTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-readiness/ProbePlan')
type ProbePlanTypeId = typeof ProbePlanTypeId

/** The condition names a port with no binding behind it; no host probe runs. */
export class ProbeAbsent extends Schema.TaggedClass<ProbeAbsent>()('ProbeAbsent', { guestPort: Schema.Int }) {
  readonly [ProbePlanTypeId] = ProbePlanTypeId
}

/** The condition dials the bound host socket. */
export class ProbeTcp extends Schema.TaggedClass<ProbeTcp>()('ProbeTcp', { binding: PortBinding }) {
  readonly [ProbePlanTypeId] = ProbePlanTypeId
}

/** The condition exchanges an HTTP request over the bound host socket. */
export class ProbeHttp extends Schema.TaggedClass<ProbeHttp>()('ProbeHttp', {
  binding: PortBinding,
  path: Schema.String,
}) {
  readonly [ProbePlanTypeId] = ProbePlanTypeId
}

/** The condition reads the guest log stream for a pattern. */
export class ProbeLog extends Schema.TaggedClass<ProbeLog>()('ProbeLog', { pattern: Schema.String }) {
  readonly [ProbePlanTypeId] = ProbePlanTypeId
}

/** The probe one condition resolves to. */
export const ProbePlan = Schema.Union([ProbeAbsent, ProbeTcp, ProbeHttp, ProbeLog])
export type ProbePlan = typeof ProbePlan.Type

export class ResolveProbe extends Schema.TaggedClass<ResolveProbe>()('ResolveProbe', {
  target: ProbeTarget,
  condition: Condition,
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

const bindingOf = (target: ProbeTarget, guestPort: number): Option.Option<PortBinding> =>
  Arr.findFirst(target.bindings, (binding) => binding.guest === guestPort)

const mappedPlan = (
  binding: Option.Option<PortBinding>,
  guestPort: number,
  onBound: (binding: PortBinding) => ProbePlan,
): ProbePlan =>
  Option.match(binding, {
    onNone: (): ProbePlan => new ProbeAbsent({ guestPort }),
    onSome: onBound,
  })

export const resolveProbe = Workflow.make({
  command: ResolveProbe,
  decision: ProbePlan,
  error: Schema.Never,
  decide: (command): Result.Result<ProbePlan, never> =>
    Result.succeed(
      Match.value(command.condition).pipe(
        Match.tag('Log', (log): ProbePlan => new ProbeLog({ pattern: log.pattern })),
        Match.tag(
          'Tcp',
          (tcp): ProbePlan =>
            mappedPlan(
              bindingOf(command.target, tcp.guestPort),
              tcp.guestPort,
              (binding) => new ProbeTcp({ binding }),
            ),
        ),
        Match.tag(
          'Http',
          (http): ProbePlan =>
            mappedPlan(
              bindingOf(command.target, http.guestPort),
              http.guestPort,
              (binding) => new ProbeHttp({ binding, path: http.path }),
            ),
        ),
        Match.exhaustive,
      ),
    ),
})
