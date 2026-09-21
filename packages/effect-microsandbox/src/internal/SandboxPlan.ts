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
if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const guestArb = Arbitrary.schema(GuestPort)
  const bindingArb = Arbitrary.map(
    guestArb,
    (guest): PortBinding => ({ guest, host: LOOPBACK, hostPort: 0 }),
  )
  const bindingsArb = Arbitrary.array(bindingArb, { maxLength: 4 })
  const specArb = Arbitrary.schema(MicroVMSpec)

  const baseSpec: MicroVMSpec = { image: 'alpine:3.20', env: {}, ports: [], mounts: [] }

  const nameFor = (): string => renderSandboxName(4242, 'deadbeef')

  const portsRenderLoopback = (spec: MicroVMSpec, bindings: ReadonlyArray<PortBinding>): boolean => {
    const plan = Result.getFailure(planFor(spec, bindings, nameFor()))
    return !Option.isSome(plan) && bindings.every((binding) => isLoopback(binding.host))
  }
  const echoesSpec = (spec: MicroVMSpec, bindings: ReadonlyArray<PortBinding>): boolean => {
    const plan = Result.getOrUndefined(planFor(spec, bindings, nameFor()))
    return plan !== undefined && plan.image === spec.image
  }
  const echoesPortCount = (spec: MicroVMSpec, bindings: ReadonlyArray<PortBinding>): boolean => {
    const plan = Result.getOrUndefined(planFor(spec, bindings, nameFor()))
    return plan !== undefined && plan.portBindings.length === bindings.length
  }
  const echoesMiB = (spec: MicroVMSpec): boolean => {
    const plan = Result.getOrUndefined(planFor(spec, [], nameFor()))
    return plan !== undefined && plan.memoryMiB === spec.memoryMb
  }
  const echoesCPUs = (spec: MicroVMSpec): boolean => {
    const plan = Result.getOrUndefined(planFor(spec, [], nameFor()))
    return plan !== undefined && plan.cpus === spec.vCPUs
  }
  const rejectsOutside = (spec: MicroVMSpec, guest: number): boolean =>
    Result.isFailure(planFor(spec, [{ guest, host: '192.0.2.1', hostPort: 0 }], nameFor()))
  const violationFor = (spec: MicroVMSpec, guest: number): boolean => {
    const failure = Option.getOrUndefined(
      Result.getFailure(planFor(spec, [{ guest, host: '192.0.2.1', hostPort: 0 }], nameFor())),
    )
    return Schema.is(LoopbackViolationError)(failure)
  }
  const acceptsKtd7 = (): boolean => {
    const plan = Result.getOrUndefined(planFor(baseSpec, [], renderSandboxName(1, 'abc123')))
    return plan !== undefined
  }

  it.prop(
    '∀spec_PlanRender_=Loopback',
    [specArb, bindingsArb],
    ([spec, bindings]) => portsRenderLoopback(spec, bindings),
  )
  it.prop('∀spec_PlanEcho_=Spec', [specArb, bindingsArb], ([spec, bindings]) => echoesSpec(spec, bindings))
  it.prop('∀spec_PortEcho_=Count', [specArb, bindingsArb], ([spec, bindings]) => echoesPortCount(spec, bindings))
  it.prop('∀mem_RenderMiB_=Spec', [specArb], ([spec]) => echoesMiB(spec))
  it.prop('∀vcpu_RenderCount_=Spec', [specArb], ([spec]) => echoesCPUs(spec))
  it.prop('∀guest_Outside8_⊥', [specArb, guestArb], ([spec, guest]) => rejectsOutside(spec, guest))
  it.prop('∀guest_Outside8_=Violation', [specArb, guestArb], ([spec, guest]) => violationFor(spec, guest))
  it.prop('∀pid_SuffixName_=Ktd7', [], () => NAME_PATTERN.test(renderSandboxName(4242, 'deadbeef')))
  it.prop('∀name_Ktd7_∈Plan', [], () => acceptsKtd7())
}
