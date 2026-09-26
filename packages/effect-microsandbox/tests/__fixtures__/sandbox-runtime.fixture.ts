import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import {
  Array as Arr,
  ConfigProvider,
  Context,
  Crypto,
  Effect,
  FileSystem,
  HashMap,
  HashSet,
  Layer,
  Option,
  Ref,
  Schema,
} from 'effect'
import type * as Scope from 'effect/Scope'
import type { ResolvedRuntime, Sandbox } from 'microsandbox'
import type { SandboxRuntimeUnderTest } from './sandbox-runtime-laws.fixture.js'

/**
 * What one client process created while it ran. The check's rule reads this: a run that
 * *ends* — its scope closes, because the program finished or a stop interrupted it — must
 * leave no sandbox created and no host port it reserved still held. A killed run never
 * ends, so nothing of it unwinds; the outside system still holds what it had created, and
 * the rule blames nobody for what no finalizer could have run.
 */
export interface SandboxRun {
  sandboxes: Array<string>
  ports: Array<number>
  ended: boolean
}

/**
 * The outside systems a boot talks to, as one plain world the checks rebuild for every
 * attempt: the sandbox runtime's ledger, the port allocator's reservations, and the
 * resolved runtime. `owners` maps a sandbox back to the run that created it, so a release
 * is credited to the run whose scope ran it.
 */
export interface SandboxWorld {
  readonly runs: Array<SandboxRun>
  readonly owners: Array<{ readonly name: string; readonly run: SandboxRun }>
  readonly held: Array<string>
  readonly destroyed: Array<string>
  readonly resolved: Array<string>
  readonly nextPort: { count: number }
}

export const newSandboxWorld = (): SandboxWorld => ({
  runs: [],
  owners: [],
  held: [],
  destroyed: [],
  resolved: [],
  nextPort: { count: 0 },
})

export const sandboxWorld: Effect.Effect<SandboxWorld> = Effect.sync(newSandboxWorld)

const FIRST_PORT = 41_000
const READY_LOG: ReadonlyArray<string> = ['service listening on 8080']

/**
 * Runs one client process against the world: everything it creates belongs to this run
 * until its scope closes, which is what marks the run as ended.
 */
export const runningProcess =
  (world: SandboxWorld) => <A, E, R>(body: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Scope.Scope> =>
    Effect.gen(function*() {
      const run = yield* Effect.sync((): SandboxRun => {
        const started: SandboxRun = { sandboxes: [], ports: [], ended: false }
        world.runs.push(started)
        return started
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          run.ended = true
        })
      )
      return yield* body
    })

const currentRun = (world: SandboxWorld): SandboxRun | undefined => world.runs.at(-1)

const reservePort = (world: SandboxWorld, guest: number): { guest: number; host: string; hostPort: number } => {
  const hostPort = FIRST_PORT + world.nextPort.count
  world.nextPort.count += 1
  currentRun(world)?.ports.push(hostPort)
  return { guest, host: '127.0.0.1', hostPort }
}

const releasePort = (world: SandboxWorld, hostPort: number): void => {
  for (const run of world.runs) {
    const index = run.ports.indexOf(hostPort)
    if (index >= 0) run.ports.splice(index, 1)
  }
}

const stubSandboxOf = (world: SandboxWorld, name: string): Sandbox =>
  ({
    name,
    exec: (cmd: string, args: ReadonlyArray<string>) =>
      Promise.resolve({
        status: { code: 0 },
        stdout: () => `${cmd} ${args.join(' ')}`,
        stderr: () => '',
      }),
    execDefault: () =>
      Promise.resolve({ code: 0, stdoutBytes: () => new Uint8Array(), stderrBytes: () => new Uint8Array() }),
    ping: () => Promise.resolve(true),
    logs: () => Promise.resolve([]),
    stop: () => Promise.resolve(destroySandbox(world, name)),
    stopWithTimeout: () => Promise.resolve(destroySandbox(world, name)),
    killWithTimeout: () => Promise.resolve(destroySandbox(world, name)),
    destroy: () => Promise.resolve(destroySandbox(world, name)),
  }) as object as Sandbox

const createSandbox = (world: SandboxWorld, name: string): Sandbox => {
  const run = currentRun(world)
  if (run !== undefined) {
    run.sandboxes.push(name)
    world.owners.push({ name, run })
  }
  world.held.push(name)
  return stubSandboxOf(world, name)
}

const destroySandbox = (world: SandboxWorld, name: string): void => {
  for (const owner of world.owners) {
    if (owner.name !== name) continue
    const index = owner.run.sandboxes.indexOf(name)
    if (index >= 0) owner.run.sandboxes.splice(index, 1)
  }
  const held = world.held.indexOf(name)
  if (held >= 0) world.held.splice(held, 1)
  world.destroyed.push(name)
}

const stubRuntime: ResolvedRuntime = {
  msbPath: '/stub/msb',
  libkrunfwPath: '/stub/libkrunfw',
  origin: 'configuration',
}

const connectedDial: Readiness.DialEvidence = { _tag: 'Connected' }
const DIAL_LATENCY = '5 millis'

const answerDial: Effect.Effect<Readiness.DialEvidence> = Effect.andThen(
  Effect.sleep(DIAL_LATENCY),
  Effect.succeed(connectedDial),
)

const responding: Readiness.HttpEvidence = Option.getOrElse(
  Schema.decodeOption(Readiness.Responded)({ _tag: 'Responded', statusLine: 'HTTP/1.0 200 OK' }),
  (): Readiness.HttpEvidence => ({ _tag: 'Refused' }),
)

const KILL_TIMEOUT_MILLIS = 5_000

/**
 * The fake sandbox runtime, wearing the same adapter the real microsandbox runtime does,
 * so the shared law suite in `sandbox-runtime-laws.fixture.ts` judges both.
 */
export const sandboxRuntimeUnderTest = (world: SandboxWorld): SandboxRuntimeUnderTest => ({
  acquire: (plan) => Effect.sync(() => createSandbox(world, plan.name)),
  release: (sandbox) => Effect.sync(() => destroySandbox(world, sandbox.name)),
  kill: (sandbox) => Effect.promise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MILLIS)),
  heldByOutside: (sandbox) => Effect.sync(() => world.held.includes(sandbox.name)),
})

/** A fake runtime over its own fresh world, so each law starts from nothing. */
export const freshSandboxRuntime = (): SandboxRuntimeUnderTest => sandboxRuntimeUnderTest(newSandboxWorld())

/**
 * The fake outside systems the boot units talk to, all recording into the world: the
 * runtime resolver, the port allocator, and the sandbox runtime's create-and-release chain.
 */
export const sandboxRuntimeOver = (world: SandboxWorld) => {
  const runtime = sandboxRuntimeUnderTest(world)
  return Layer.mergeAll(
    Layer.succeed(MicroVM.RuntimeResolver, {
      resolve: (platform: string) =>
        Effect.sync(() => {
          world.resolved.push(platform)
          return stubRuntime
        }),
    }),
    Layer.succeed(MicroVM.PortAllocator, {
      reserve: (guest: number) =>
        Effect.acquireRelease(
          Effect.sync(() => reservePort(world, guest)),
          (binding) => Effect.sync(() => releasePort(world, binding.hostPort)),
        ),
    }),
    Layer.succeed(MicroVM.SandboxRuntime, { acquire: runtime.acquire, release: runtime.release }),
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size: number) => new Uint8Array(size),
        digest: () => Effect.succeed(new Uint8Array()),
      }),
    ),
    Layer.succeed(Readiness.HostProber, {
      dial: () => answerDial,
      exchange: () => Effect.succeed(responding),
    }),
    Layer.succeed(Readiness.LogSource, { entries: Effect.succeed(READY_LOG) }),
    FileSystem.layerNoop({}),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PLATFORM: 'darwin', ARCH: 'arm64' } })),
  )
}

/** The rule sentence's evidence: what a run that ended left behind, in plain words. */
export const leftBehind = (world: SandboxWorld): string | undefined => {
  const ended = world.runs.filter((run) => run.ended)
  const sandboxes = ended.flatMap((run) => run.sandboxes)
  const ports = ended.flatMap((run) => run.ports)
  if (sandboxes.length === 0 && ports.length === 0) return undefined
  return `a run that ended left ${sandboxes.length} sandbox(es) created (${listOf(sandboxes)}) and ` +
    `${ports.length} host port(s) held (${listOf(ports)})`
}

const listOf = (values: ReadonlyArray<string | number>): string => (values.length === 0 ? 'none' : values.join(', '))

export class SandboxLedger extends Context.Service<
  SandboxLedger,
  {
    readonly created: Effect.Effect<number>
    readonly outstanding: Effect.Effect<ReadonlyArray<string>>
    readonly heldPorts: Effect.Effect<ReadonlyArray<number>>
  }
>()('@systemfsoftware/effect-microsandbox/tests/boot-sandbox-release.conformance.test/SandboxLedger') {}

interface ReservedPort {
  readonly guest: number
  readonly host: string
  readonly hostPort: number
}

const stubSandbox = (name: string): Sandbox => ({ name }) as object as Sandbox

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
