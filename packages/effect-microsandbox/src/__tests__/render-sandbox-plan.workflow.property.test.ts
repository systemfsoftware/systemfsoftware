import { it } from '@effect/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import { GuestPort, MicroVMSpec } from '../MicroVMSpec.schema.js'
import {
  PlanRefused,
  PlanSandbox,
  type PortBinding,
  renderSandboxPlan,
  type SandboxPlan,
  type SandboxPlanDecision,
} from '../render-sandbox-plan.workflow.js'

const holds = (clauses: ReadonlyArray<boolean>): boolean => clauses.every((clause) => clause)

const isLoopbackHost = (host: string): boolean => [host === '127.0.0.1', host.startsWith('127.')].some(Boolean)

const decisionOf = (command: PlanSandbox): SandboxPlanDecision => Result.getOrThrow(renderSandboxPlan(command))

const approvedOf = (command: PlanSandbox): Option.Option<SandboxPlan> =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('PlanApproved', ({ plan }) => Option.some(plan)),
    Match.tag('PlanRefused', () => Option.none<SandboxPlan>()),
    Match.exhaustive,
  )

const refusedOf = (command: PlanSandbox): Option.Option<PlanRefused> =>
  Match.value(decisionOf(command)).pipe(
    Match.tag('PlanApproved', () => Option.none<PlanRefused>()),
    Match.tag('PlanRefused', (refused) => Option.some(refused)),
    Match.exhaustive,
  )

const planLaw = (command: PlanSandbox, law: (plan: SandboxPlan) => boolean): boolean =>
  Option.match(approvedOf(command), { onNone: () => false, onSome: law })

const refusalLaw = (command: PlanSandbox, law: (refused: PlanRefused) => boolean): boolean =>
  Option.match(refusedOf(command), { onNone: () => false, onSome: law })

const octet = Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))))
const guestPortArb = Arbitrary.schema(GuestPort)
const loopbackHost = Arbitrary.map(Arbitrary.all([octet, octet, octet]), ([a, b, c]) => `127.${a}.${b}.${c}`)

const outsideOctet = Arbitrary.map(octet, (value) => (value === 127 ? 126 : value))
const outsideHost = Arbitrary.map(
  Arbitrary.all([outsideOctet, octet, octet, octet]),
  ([a, b, c, d]) => `${a}.${b}.${c}.${d}`,
)

const loopbackBinding = Arbitrary.map(
  Arbitrary.all([guestPortArb, loopbackHost, guestPortArb]),
  ([guest, host, hostPort]): PortBinding => ({ guest, host, hostPort }),
)
const outsideBinding = Arbitrary.map(
  Arbitrary.all([guestPortArb, outsideHost, guestPortArb]),
  ([guest, host, hostPort]): PortBinding => ({ guest, host, hostPort }),
)
const loopbackBindings = Arbitrary.array(loopbackBinding, { maxLength: 4 })

const successCase = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(MicroVMSpec),
    loopbackBindings,
    Arbitrary.schema(Schema.Int),
    Arbitrary.schema(Schema.String),
  ]),
  ([spec, bindings, pid, suffix]): PlanSandbox => new PlanSandbox({ spec, bindings, name: `sandbox-${pid}-${suffix}` }),
)

const refusalCase = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(MicroVMSpec),
    loopbackBindings,
    outsideBinding,
    Arbitrary.schema(Schema.Int),
    Arbitrary.schema(Schema.String),
  ]),
  ([spec, loopbacks, outside, pid, suffix]): Readonly<{ command: PlanSandbox; offender: PortBinding }> => ({
    command: new PlanSandbox({ spec, bindings: [...loopbacks, outside], name: `sandbox-${pid}-${suffix}` }),
    offender: outside,
  }),
)

const cmdEchoes = (plan: SandboxPlan, cmd: ReadonlyArray<string> | undefined): boolean =>
  Option.match(Option.fromNullishOr(cmd), {
    onNone: () => plan.cmd === undefined,
    onSome: (someCmd) =>
      Option.match(Option.fromNullishOr(plan.cmd), {
        onNone: () => false,
        onSome: (planCmd) => holds([planCmd.length === someCmd.length, planCmd.every((arg, i) => arg === someCmd[i])]),
      }),
  })

it.prop('∀outside_Render_=Refused', [refusalCase], ([{ command, offender }]) =>
  refusalLaw(command, (refused) =>
    holds([
      refused.sandboxName === command.name,
      refused.host === offender.host,
      refused.guestPort === offender.guest,
    ])))

it.prop('∀loopback_Render_=Approved', [successCase], ([command]) =>
  planLaw(command, (plan) => {
    const allLoopback = plan.portBindings.every((b) => isLoopbackHost(b.host))
    const roleCorrect = Match.value(command.spec).pipe(
      Match.tag('Service', () =>
        holds([
          plan.portBindings.length === command.bindings.length,
          plan.cmd === undefined,
          plan.workdir === undefined,
        ])),
      Match.tag('Job', (job) =>
        holds([
          plan.portBindings.length === 0,
          cmdEchoes(plan, job.cmd),
          plan.workdir === job.workdir,
        ])),
      Match.exhaustive,
    )
    return holds([allLoopback, roleCorrect])
  }))

it.prop('∀plan_Configuration_=Conserved', [successCase], ([command]) =>
  planLaw(command, (plan) => {
    const envKeys = Object.keys(command.spec.env)
    return holds([
      plan.name === command.name,
      plan.image === command.spec.image,
      plan.cpus === command.spec.vCPUs,
      plan.memoryMiB === command.spec.memoryMb,
      plan.mounts.length === command.spec.mounts.length,
      envKeys.length === Object.keys(plan.envs).length,
      envKeys.every((k) => plan.envs[k] === command.spec.env[k]),
    ])
  }))
