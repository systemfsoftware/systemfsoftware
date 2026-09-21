/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { LoopbackViolationError } from '../MicroVMError.schema.js'
import { GuestPort, MicroVMSpec } from '../MicroVMSpec.schema.js'

/** @internal */
export interface PortBinding {
  readonly guest: number
  readonly host: string
  readonly hostPort: number
}

/** @internal */
export interface SandboxPlan {
  readonly name: string
  readonly image: string
  readonly envs: Record<string, string>
  readonly cpus: number | undefined
  readonly memoryMiB: number | undefined
  readonly workdir: string | undefined
  readonly cmd: ReadonlyArray<string> | undefined
  readonly mounts: ReadonlyArray<{ readonly guest: string; readonly host: string }>
  readonly portBindings: ReadonlyArray<PortBinding>
}

const NAME_PATTERN = /^effect-microsandbox-\d+-[0-9a-f]{6,}$/
const LOOPBACK = '127.0.0.1'

const isLoopback = (host: string): boolean => host === LOOPBACK || host.startsWith('127.')

/** @internal */
export const renderSandboxName = (pid: number, suffix: string): string => `effect-microsandbox-${pid}-${suffix}`

const illegalBinding = (bindings: ReadonlyArray<PortBinding>): PortBinding | undefined =>
  bindings.find((binding) => !isLoopback(binding.host))

const cmdOf = (spec: MicroVMSpec): ReadonlyArray<string> | undefined =>
  spec.cmd === undefined ? undefined : [...spec.cmd]

/** @internal */
export const planFor = (
  spec: MicroVMSpec,
  portBindings: ReadonlyArray<PortBinding>,
  name: string,
): Result.Result<SandboxPlan, LoopbackViolationError> => {
  const illegal = illegalBinding(portBindings)
  return illegal === undefined
    ? Result.succeed({
      name,
      image: spec.image,
      envs: { ...spec.env },
      cpus: spec.vCPUs,
      memoryMiB: spec.memoryMb,
      workdir: spec.workdir,
      cmd: cmdOf(spec),
      mounts: spec.mounts.map((mount) => ({ guest: mount.guest, host: mount.host })),
      portBindings: portBindings.map((binding) => ({ ...binding })),
    })
    : Result.fail(
      new LoopbackViolationError({ sandboxName: name, host: illegal.host, guestPort: illegal.guest }),
    )
}
interface PlanCase {
  readonly spec: MicroVMSpec
  readonly bindings: ReadonlyArray<PortBinding>
  readonly name: string
}

interface RefusalCase extends PlanCase {
  readonly offender: PortBinding
}

/** Every clause of a compound law must hold; stated once so laws stay flat. */
const holds = (clauses: ReadonlyArray<boolean>): boolean => clauses.every((clause) => clause)

const cmdEchoes = (plan: SandboxPlan, cmd: ReadonlyArray<string> | undefined): boolean =>
  Option.match(Option.fromNullishOr(cmd), {
    onNone: () => plan.cmd === undefined,
    onSome: (someCmd) =>
      Option.match(Option.fromNullishOr(plan.cmd), {
        onNone: () => false,
        onSome: (planCmd) =>
          holds([
            planCmd.length === someCmd.length,
            planCmd.every((arg, i) => arg === someCmd[i]),
          ]),
      }),
  })

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const octet = Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))))
  const guestPortArb = Arbitrary.schema(GuestPort)

  // A 127/8 loopback host, constructed octet by octet — every host the
  // loopback law quantifies over is reachable, none merely sampled.
  const loopbackHost = Arbitrary.map(
    Arbitrary.all([octet, octet, octet]),
    ([a, b, c]) => `127.${a}.${b}.${c}`,
  )

  // A host outside 127/8: the first octet folds off 127 constructively, so the
  // refusal law quantifies over the complement without a filter.
  const outsideOctet = Arbitrary.map(octet, (o) => (o === 127 ? 126 : o))
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
    ([spec, bindings, pid, suffix]): PlanCase => ({ spec, bindings, name: renderSandboxName(pid, suffix) }),
  )
  const refusalCase = Arbitrary.map(
    Arbitrary.all([
      Arbitrary.schema(MicroVMSpec),
      loopbackBindings,
      outsideBinding,
      Arbitrary.schema(Schema.Int),
      Arbitrary.schema(Schema.String),
    ]),
    ([spec, loopbacks, outside, pid, suffix]): RefusalCase => ({
      spec,
      bindings: [...loopbacks, outside],
      offender: outside,
      name: renderSandboxName(pid, suffix),
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

  // Positional echo, compared without index lookups: the joined key sequence
  // is order-sensitive, so a reordered or dropped binding breaks the law.
  const bindingKey = (binding: PortBinding): string => `${binding.guest}:${binding.host}:${binding.hostPort}`
  const mountKey = (mount: { readonly host: string; readonly guest: string }): string => `${mount.host}->${mount.guest}`

  const planOf = (input: PlanCase, law: (plan: SandboxPlan) => boolean): boolean =>
    Result.match(planFor(input.spec, input.bindings, input.name), { onSuccess: law, onFailure: () => false })

  const refusalOf = (input: PlanCase, law: (violation: LoopbackViolationError) => boolean): boolean =>
    Result.match(planFor(input.spec, input.bindings, input.name), {
      onSuccess: () => false,
      onFailure: law,
    })

  // All-loopback bindings render; the refusal cases below pin the complement.
  it.prop('∀plan_Render_=Success', [successCase], ([input]) => planOf(input, () => true))

  // The plan is a projection: every rendered field echoes its spec source.
  it.prop('∀plan_Image_=Spec', [successCase], ([input]) => planOf(input, (plan) => plan.image === input.spec.image))
  it.prop('∀plan_Bindings_=Echo', [successCase], ([input]) =>
    planOf(input, (plan) =>
      holds([
        plan.portBindings.length === input.bindings.length,
        plan.portBindings.map(bindingKey).join('|') === input.bindings.map(bindingKey).join('|'),
      ])))
  it.prop(
    '∀plan_Bindings_=Loopback',
    [successCase],
    ([input]) => planOf(input, (plan) => plan.portBindings.every((binding) => isLoopback(binding.host))),
  )
  it.prop('∀plan_Mounts_=Echo', [successCase], ([input]) =>
    planOf(input, (plan) =>
      holds([
        plan.mounts.length === input.spec.mounts.length,
        plan.mounts.map(mountKey).join('|') === input.spec.mounts.map(mountKey).join('|'),
      ])))
  it.prop('∀plan_Limits_=Echo', [successCase], ([input]) =>
    planOf(input, (plan) =>
      holds([
        plan.cpus === input.spec.vCPUs,
        plan.memoryMiB === input.spec.memoryMb,
        plan.workdir === input.spec.workdir,
      ])))
  it.prop('∀plan_Cmd_=Echo', [successCase], ([input]) => planOf(input, (plan) => cmdEchoes(plan, input.spec.cmd)))
  it.prop('∀plan_Envs_=Echo', [successCase], ([input]) =>
    planOf(input, (plan) => {
      const env = input.spec.env
      const keys = Object.keys(env)
      return keys.length === Object.keys(plan.envs).length && keys.every((key) => plan.envs[key] === env[key])
    }))
  it.prop('∀plan_Name_=Echo', [successCase], ([input]) => planOf(input, (plan) => plan.name === input.name))

  // A rendered name always satisfies the documented addressability pattern.
  it.prop('∀name_Ktd7_=Shape', [nameDraw], ([[pid, suffix]]) => NAME_PATTERN.test(renderSandboxName(pid, suffix)))

  // A binding outside 127/8 refuses the whole render, naming the offender.
  it.prop(
    '∀outside_Render_=⊥',
    [refusalCase],
    ([input]) => Result.isFailure(planFor(input.spec, input.bindings, input.name)),
  )
  it.prop(
    '∀outside_Violation_=Typed',
    [refusalCase],
    ([input]) => refusalOf(input, (violation) => Schema.is(LoopbackViolationError)(violation)),
  )
  it.prop('∀outside_Violation_=Echo', [refusalCase], ([input]) =>
    refusalOf(input, (violation) => {
      return holds([
        violation.sandboxName === input.name,
        violation.host === input.offender.host,
        violation.guestPort === input.offender.guest,
      ])
    }))
}
