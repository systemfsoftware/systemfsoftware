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
import { renderSandboxName } from '../sandbox-name.js'

const ADDRESSABLE_NAME = /^effect-microsandbox-\d+-[0-9a-f]{6,}$/

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
  ([spec, bindings, pid, suffix]): PlanSandbox =>
    new PlanSandbox({ spec, bindings, name: renderSandboxName(pid, suffix) }),
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
    command: new PlanSandbox({ spec, bindings: [...loopbacks, outside], name: renderSandboxName(pid, suffix) }),
    offender: outside,
  }),
)

const pidDraw = Arbitrary.schema(
  Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }))),
)
const hexDigit = Arbitrary.map(
  Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 15 })))),
  (digit) => '0123456789abcdef'.charAt(digit),
)
const suffixDraw = Arbitrary.map(
  Arbitrary.array(hexDigit, { minLength: 6, maxLength: 16 }),
  (chars) => chars.join(''),
)
const nameDraw = Arbitrary.all([pidDraw, suffixDraw])

const bindingKey = (binding: PortBinding): string => `${binding.guest}:${binding.host}:${binding.hostPort}`

const mountKey = (mount: { readonly guest: string; readonly host: string }): string => `${mount.host}->${mount.guest}`

const cmdEchoes = (plan: SandboxPlan, cmd: ReadonlyArray<string> | undefined): boolean =>
  Option.match(Option.fromNullishOr(cmd), {
    onNone: () => plan.cmd === undefined,
    onSome: (someCmd) =>
      Option.match(Option.fromNullishOr(plan.cmd), {
        onNone: () => false,
        onSome: (planCmd) => holds([planCmd.length === someCmd.length, planCmd.every((arg, i) => arg === someCmd[i])]),
      }),
  })

it.prop('∀plan_Render_=Approved', [successCase], ([command]) => planLaw(command, () => true))
it.prop(
  '∀plan_Image_=Spec',
  [successCase],
  ([command]) => planLaw(command, (plan) => plan.image === command.spec.image),
)
it.prop('∀plan_Bindings_=Echo', [successCase], ([command]) =>
  planLaw(command, (plan) =>
    holds([
      plan.portBindings.length === command.bindings.length,
      plan.portBindings.map(bindingKey).join('|') === command.bindings.map(bindingKey).join('|'),
    ])))
it.prop(
  '∀plan_Bindings_=Loopback',
  [successCase],
  ([command]) => planLaw(command, (plan) => plan.portBindings.every((binding) => isLoopbackHost(binding.host))),
)
it.prop('∀plan_Mounts_=Echo', [successCase], ([command]) =>
  planLaw(command, (plan) =>
    holds([
      plan.mounts.length === command.spec.mounts.length,
      plan.mounts.map(mountKey).join('|') === command.spec.mounts.map(mountKey).join('|'),
    ])))
it.prop('∀plan_Limits_=Echo', [successCase], ([command]) =>
  planLaw(command, (plan) =>
    holds([
      plan.cpus === command.spec.vCPUs,
      plan.memoryMiB === command.spec.memoryMb,
      plan.workdir === command.spec.workdir,
    ])))
it.prop('∀plan_Cmd_=Echo', [successCase], ([command]) => planLaw(command, (plan) => cmdEchoes(plan, command.spec.cmd)))
it.prop('∀plan_Envs_=Echo', [successCase], ([command]) =>
  planLaw(command, (plan) => {
    const env = command.spec.env
    const keys = Object.keys(env)
    return keys.length === Object.keys(plan.envs).length && keys.every((key) => plan.envs[key] === env[key])
  }))
it.prop('∀plan_Name_=Echo', [successCase], ([command]) => planLaw(command, (plan) => plan.name === command.name))

it.prop('∀name_Ktd7_=Shape', [nameDraw], ([[pid, suffix]]) => ADDRESSABLE_NAME.test(renderSandboxName(pid, suffix)))

it.prop('∀outside_Render_=Refused', [refusalCase], ([{ command }]) => Option.isNone(approvedOf(command)))
it.prop(
  '∀outside_Violation_=Typed',
  [refusalCase],
  ([{ command }]) => refusalLaw(command, (refused) => Schema.is(PlanRefused)(refused)),
)
it.prop('∀outside_Violation_=Echo', [refusalCase], ([{ command, offender }]) =>
  refusalLaw(command, (refused) =>
    holds([
      refused.sandboxName === command.name,
      refused.host === offender.host,
      refused.guestPort === offender.guest,
    ])))
