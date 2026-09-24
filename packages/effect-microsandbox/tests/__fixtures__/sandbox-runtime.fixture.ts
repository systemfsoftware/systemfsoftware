import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Array as Arr, Context, Data, Effect, HashMap, HashSet, Layer, Ref } from 'effect'
import type * as Scope from 'effect/Scope'
import type { ResolvedRuntime, Sandbox } from 'microsandbox'

export class SandboxLeftBehind extends Data.TaggedError('SandboxLeftBehind')<{
  readonly names: ReadonlyArray<string>
  readonly heldPorts: ReadonlyArray<number>
}> {}

export class SandboxLedger extends Context.Service<
  SandboxLedger,
  {
    readonly created: Effect.Effect<number>
    readonly outstanding: Effect.Effect<ReadonlyArray<string>>
    readonly heldPorts: Effect.Effect<ReadonlyArray<number>>
  }
>()('@systemfsoftware/effect-microsandbox/tests/boot-sandbox-release.conformance.test/SandboxLedger') {}

const FIRST_PORT = 41_000

interface ReservedPort {
  readonly guest: number
  readonly host: string
  readonly hostPort: number
}

const stubSandbox = (name: string): Sandbox => ({ name }) as object as Sandbox

const stubRuntime: ResolvedRuntime = {
  msbPath: '/stub/msb',
  libkrunfwPath: '/stub/libkrunfw',
  origin: 'configuration',
}

export const recordingSandboxRuntime: Layer.Layer<SandboxLedger> = Layer.unwrap(
  Effect.gen(function*() {
    const portSequence = yield* Ref.make(0)
    const sandboxSequence = yield* Ref.make(0)
    const reserved = yield* Ref.make(HashSet.empty<number>())
    const created = yield* Ref.make(HashMap.empty<string, ReadonlyArray<number>>())
    const destroyed = yield* Ref.make(HashSet.empty<string>())
    return Layer.mergeAll(
      Layer.succeed(MicroVM.RuntimeResolver, { resolve: () => Effect.succeed(stubRuntime) }),
      Layer.succeed(MicroVM.PortAllocator, {
        reserve: (guest: number): Effect.Effect<ReservedPort, never, Scope.Scope> =>
          Effect.acquireRelease(
            Effect.gen(function*() {
              const index = yield* Ref.getAndUpdate(portSequence, (current) => current + 1)
              const hostPort = FIRST_PORT + index
              yield* Ref.update(reserved, HashSet.add(hostPort))
              return { guest, host: '127.0.0.1', hostPort }
            }),
            (binding) => Ref.update(reserved, HashSet.remove(binding.hostPort)),
          ),
      }),
      Layer.succeed(MicroVM.SandboxRuntime, {
        acquire: (plan) =>
          Effect.gen(function*() {
            const held = yield* Ref.get(reserved)
            const stillHeld = plan.portBindings.find((binding) => HashSet.has(held, binding.hostPort))
            if (stillHeld !== undefined) {
              return yield* new MicroVM.SandboxBootError({
                sandboxName: plan.name,
                cause: `host port ${stillHeld.hostPort} is still held by the allocator`,
              })
            }
            const index = yield* Ref.getAndUpdate(sandboxSequence, (current) => current + 1)
            const name = `sandbox-stub-${index}`
            const hostPorts: ReadonlyArray<number> = plan.portBindings.map((binding) => binding.hostPort)
            yield* Ref.update(created, HashMap.set(name, hostPorts))
            return stubSandbox(name)
          }),
        release: (sandbox) => Ref.update(destroyed, HashSet.add(sandbox.name)),
      }),
      Layer.succeed(SandboxLedger, {
        created: Ref.get(sandboxSequence),
        outstanding: Effect.gen(function*() {
          const made = yield* Ref.get(created)
          const gone = yield* Ref.get(destroyed)
          return Arr.fromIterable(HashMap.keys(made)).filter((name) => !HashSet.has(gone, name))
        }),
        heldPorts: Effect.map(Ref.get(reserved), (ports) => Arr.fromIterable(ports)),
      }),
    )
  }),
)

export const nothingLeftHeld: Effect.Effect<void, SandboxLeftBehind, SandboxLedger> = Effect.flatMap(
  Effect.service(SandboxLedger),
  (ledger) =>
    Effect.gen(function*() {
      const outstanding = yield* ledger.outstanding
      const heldPorts = yield* ledger.heldPorts
      if (outstanding.length === 0 && heldPorts.length === 0) return
      return yield* new SandboxLeftBehind({ names: outstanding, heldPorts })
    }),
)
