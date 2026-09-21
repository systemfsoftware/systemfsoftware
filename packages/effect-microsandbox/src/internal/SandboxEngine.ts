import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Effect } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Scope from 'effect/Scope'
import { MountBuilder, Sandbox } from 'microsandbox'
import type { SandboxBuilder } from 'microsandbox'
type NapiMountBuilderT = InstanceType<typeof MountBuilder>
import { LoopbackViolationError, PortAllocationError, SandboxBootError } from '../MicroVMError.schema.js'
import type { MicroVMError } from '../MicroVMError.schema.js'
import type { MicroVMSpec } from '../MicroVMSpec.schema.js'
import { preflightWith } from './Preflight.js'
import { planFor, renderSandboxName } from './SandboxPlan.js'
import type { PortBinding, SandboxPlan } from './SandboxPlan.js'

const STOP_TIMEOUT_MS = 10_000
const KILL_TIMEOUT_MS = 5_000

let nameCounter = 0

const nextNameSuffix = (): string => {
  nameCounter += 1
  return nameCounter.toString(16).padStart(6, '0')
}

const messageOf = (cause: unknown): string => typeof cause === 'string' ? cause : 'non-error rejection'

const describeCause = (cause: unknown): string => cause instanceof Error ? cause.message : messageOf(cause)

const optional = <A>(value: A | undefined, apply: (a: A) => void): void => {
  if (value !== undefined) apply(value)
}

const applyVolumes = (builder: SandboxBuilder, mounts: SandboxPlan['mounts']): void => {
  for (const mount of mounts) {
    builder.volume(mount.guest, (b: NapiMountBuilderT): NapiMountBuilderT => b.bind(mount.host))
  }
}

const applyPorts = (builder: SandboxBuilder, bindings: SandboxPlan['portBindings']): void => {
  for (const binding of bindings) {
    builder.portBind(binding.host, binding.hostPort, binding.guest)
  }
}

/** @internal */
export const allocateBinding = (
  guest: number,
): Effect.Effect<PortBinding, PortAllocationError, Scope.Scope> =>
  Effect.gen(function*() {
    const server = yield* NodeSocketServer.make({ host: '127.0.0.1', port: 0 }).pipe(
      Effect.mapError(
        (cause) => new PortAllocationError({ guestPort: guest, reason: describeCause(cause) }),
      ),
    )
    const address = server.address
    if (!('port' in address)) {
      return yield* new PortAllocationError({ guestPort: guest, reason: 'server reported no TCP port' })
    }
    return { guest, host: '127.0.0.1', hostPort: address.port }
  })

const allocateBindings = (
  guests: ReadonlyArray<number>,
): Effect.Effect<ReadonlyArray<PortBinding>, PortAllocationError, Scope.Scope> =>
  Effect.forEach(guests, (guest) => allocateBinding(guest), { concurrency: 'unbounded' })

const renderPlan = (
  spec: MicroVMSpec,
  bindings: ReadonlyArray<PortBinding>,
): Effect.Effect<SandboxPlan, LoopbackViolationError> =>
  Effect.suspend(() => Effect.fromResult(planFor(spec, bindings, renderSandboxName(process.pid, nextNameSuffix()))))

const applyPlan = (plan: SandboxPlan, builder: SandboxBuilder): void => {
  builder.image(plan.image)
  optional(plan.cpus, (cpus) => builder.cpus(cpus))
  optional(plan.memoryMiB, (memoryMiB) => builder.memory(memoryMiB))
  optional(plan.workdir, (workdir) => builder.workdir(workdir))
  optional(plan.cmd, (cmd) => builder.cmd([...cmd]))
  builder.envs({ ...plan.envs })
  applyVolumes(builder, plan.mounts)
  applyPorts(builder, plan.portBindings)
}

const create = (plan: SandboxPlan): Effect.Effect<Sandbox, SandboxBootError> =>
  Effect.tryPromise({
    try: () => {
      const builder = Sandbox.builder(plan.name)
      applyPlan(plan, builder)
      return builder.create()
    },
    catch: (cause) => new SandboxBootError({ sandboxName: plan.name, reason: describeCause(cause) }),
  })

/** @internal */
export const boot = (
  spec: MicroVMSpec,
  fs: FileSystem.FileSystem,
): Effect.Effect<SandboxPlan, MicroVMError, Scope.Scope> =>
  Effect.gen(function*() {
    yield* preflightWith(fs)
    const bindings = yield* allocateBindings(spec.ports)
    return yield* renderPlan(spec, bindings)
  })

/** @internal */
export interface AcquiredVM {
  readonly plan: SandboxPlan
  readonly sandbox: Sandbox
}

const createAcquired = (plan: SandboxPlan): Effect.Effect<AcquiredVM, SandboxBootError> =>
  Effect.map(create(plan), (sandbox): AcquiredVM => ({ plan, sandbox }))

/** @internal */
export const acquire = (
  spec: MicroVMSpec,
  fs: FileSystem.FileSystem,
): Effect.Effect<AcquiredVM, MicroVMError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.flatMap(boot(spec, fs), (plan) => createAcquired(plan)),
    (acquired) => teardown(acquired.sandbox),
  )

/** @internal */
export const teardown = (sandbox: Sandbox): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.promise(() => sandbox.stopWithTimeout(STOP_TIMEOUT_MS)).pipe(
      Effect.catchDefect(() =>
        Effect.promise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MS)).pipe(
          Effect.catchDefect(() => Effect.void),
        )
      ),
    )
    yield* Effect.promise(() => sandbox.destroy({ force: true })).pipe(
      Effect.catchDefect(() => Effect.void),
    )
  }).pipe(Effect.uninterruptible)
