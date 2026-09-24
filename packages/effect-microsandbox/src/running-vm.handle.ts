import { Handle } from '@systemfsoftware/effect-cell-types'
import { Array, Effect, Option, pipe, Stream } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import type { NetworkPolicy, Sandbox, SandboxBuilder } from 'microsandbox'
import { ExecError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import type { PortBinding, SandboxPlan } from './render-sandbox-plan.schema.js'

const STOP_TIMEOUT_MS = 10_000
const KILL_TIMEOUT_MS = 5_000

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}

/** How a job's default workload ended, as collected from the sandbox. */
export interface JobExit {
  readonly code: number
  readonly stdout: Uint8Array
  readonly stderr: Uint8Array
}

/**
 * What {@link RunningVM} is created from: the spec the caller declared, the plan the workflow
 * rendered from it, and the host bindings the prepare step allocated for it. Nothing here can
 * hold the driver, because the driver does not exist until `create` runs.
 */
export interface BootInput {
  readonly spec: MicroVMSpec
  readonly plan: SandboxPlan
  readonly bindings: ReadonlyArray<PortBinding>
}

/** The data a live microVM handle carries: its sandbox identity and its guest-to-host bindings. */
export interface RunningVMData {
  readonly name: string
  readonly portBindings: ReadonlyArray<PortBinding>
}

/** A live microVM: data branded by the {@link RunningVM} definition, pipeable, driver-free. */
export type RunningVMType = Handle.Handle<'RunningVM', RunningVMData>

type NapiMountBuilderT = { bind(host: string): NapiMountBuilderT }
type NapiNetworkBuilderT = { policy(policy: NetworkPolicy): NapiNetworkBuilderT }
type NetworkPolicyFactory = {
  readonly fromProfiles: (profiles: Iterable<'public' | 'private' | 'host'>) => NetworkPolicy
}

const hostPortOf = (bindings: ReadonlyArray<PortBinding>, guest: number) =>
  Option.map(
    Arr.findFirst(bindings, (binding) => binding.guest === guest),
    (binding) => binding.hostPort,
  )

const prefixSlash = (path: string) => {
  if (path.startsWith('/')) {
    return path
  }
  return `/${path}`
}

const normalizePath = (path: string | undefined) =>
  Option.match(Option.fromNullishOr(path), {
    onSome: prefixSlash,
    onNone: () => '',
  })

const portOf = (self: RunningVMType, guest: number): Effect.Effect<number, PortAllocationError> =>
  Effect.fromOption(
    hostPortOf(self.portBindings, guest),
    () =>
      new PortAllocationError({
        guestPort: guest,
        cause: `Guest port ${guest} is not mapped to any host port on sandbox ${self.name}`,
      }),
  )

const compilePlan: {
  (plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): (builder: SandboxBuilder) => SandboxBuilder
  (builder: SandboxBuilder, plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): SandboxBuilder
} = dual(
  3,
  (builder: SandboxBuilder, plan: SandboxPlan, networkPolicy: NetworkPolicyFactory): SandboxBuilder =>
    pipe(
      builder.image(plan.image).envs({ ...plan.envs }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.cpus), {
          onNone: () => b,
          onSome: (cpus) => b.cpus(cpus),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.memoryMiB), {
          onNone: () => b,
          onSome: (mem) => b.memory(mem),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.workdir), {
          onNone: () => b,
          onSome: (wd) => b.workdir(wd),
        }),
      (b) =>
        Option.match(Option.fromNullishOr(plan.cmd), {
          onNone: () => b,
          onSome: (cmd) => b.cmd([...cmd]),
        }),
      (b) =>
        Array.reduce(
          plan.mounts,
          b,
          (acc, m) => acc.volume(m.guest, (v: NapiMountBuilderT) => v.bind(m.host)),
        ),
      (b) =>
        Array.reduce(
          plan.portBindings,
          b,
          (acc, p) => acc.portBind(p.host, p.hostPort, p.guest),
        ),
      (b) =>
        Option.match(Option.fromNullishOr(plan.networkProfiles), {
          onNone: () => b,
          onSome: (profiles) => b.network((n: NapiNetworkBuilderT) => n.policy(networkPolicy.fromProfiles(profiles))),
        }),
    ),
)

const createSandbox = (
  input: BootInput,
): Effect.Effect<Handle.Acquired<Sandbox, RunningVMData>, SandboxBootError> =>
  Effect.tryPromise({
    try: () => import('microsandbox'),
    catch: (cause) => new SandboxBootError({ sandboxName: input.plan.name, cause }),
  }).pipe(
    Effect.flatMap(({ Sandbox, NetworkPolicy }) =>
      Effect.tryPromise({
        try: () => compilePlan(Sandbox.builder(input.plan.name), input.plan, NetworkPolicy).create(),
        catch: (cause) => new SandboxBootError({ sandboxName: input.plan.name, cause }),
      })
    ),
    Effect.map((sandbox): Handle.Acquired<Sandbox, RunningVMData> => ({
      driver: sandbox,
      data: { name: input.plan.name, portBindings: input.bindings },
    })),
  )

/**
 * The microVM handle kind. `create` boots the sandbox from the prepared input; the release is
 * two stages — stop escalating to kill within today's timeouts, then destroy — and a stage whose
 * last attempted step fails surfaces beside the caller's exit as a defect, never discarded.
 */
export const RunningVM = Handle.make({
  name: 'RunningVM',
  create: (input: BootInput) => createSandbox(input),
  release: [
    [
      (sandbox) => Effect.promise(() => sandbox.stopWithTimeout(STOP_TIMEOUT_MS)),
      (sandbox) => Effect.promise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MS)),
    ],
    [(sandbox) => Effect.promise(() => sandbox.destroy({ force: true }))],
  ],
  operations: {
    exec: (sandbox, _self, cmd: string, args: ReadonlyArray<string> = []) =>
      Effect.map(
        Effect.tryPromise({
          try: () => sandbox.exec(cmd, [...args]),
          catch: (cause) => new ExecError({ argv: [cmd, ...args], cause }),
        }),
        (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
      ),
    ping: (sandbox) => Effect.map(Effect.option(Effect.promise(() => sandbox.ping())), Option.isSome),
    port: (_sandbox, self, guest: number) => portOf(self, guest),
    url: (_sandbox, self, guest: number, path?: string) =>
      Effect.map(portOf(self, guest), (hostPort) => `http://127.0.0.1:${hostPort}${normalizePath(path)}`),
    awaitExit: (sandbox, _self, argv: ReadonlyArray<string>) =>
      Effect.map(
        Effect.tryPromise({
          try: () => sandbox.execDefault(),
          catch: (cause) => new ExecError({ argv, cause }),
        }),
        (output): JobExit => ({ code: output.code, stdout: output.stdoutBytes(), stderr: output.stderrBytes() }),
      ),
  },
  streams: {
    logs: (sandbox, self) =>
      Stream.flatMap(
        Stream.fromEffect(
          Effect.tryPromise({
            try: () => sandbox.logStream(),
            catch: (cause) => new SandboxBootError({ sandboxName: self.name, cause }),
          }),
        ),
        (stream) =>
          Stream.fromAsyncIterable(stream, (cause) => new SandboxBootError({ sandboxName: self.name, cause })),
      ).pipe(Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() }))),
  },
})

export const exec = RunningVM.operations.exec
export const awaitExit = RunningVM.operations.awaitExit
export const logs = RunningVM.streams.logs
export const ping = RunningVM.operations.ping
export const port = RunningVM.operations.port
export const url = RunningVM.operations.url

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')
  const { GuestPort } = await import('./MicroVMSpec.schema.js')

  const uniqueGuests = Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique()))
  const bindings = Arbitrary.map(
    Arbitrary.schema(uniqueGuests),
    (guests) => guests.map((guest, index) => ({ guest, host: '127.0.0.1', hostPort: 49152 + index })),
  )

  it.prop(
    '∀bg_PortLookup_≡Declared',
    [bindings, GuestPort],
    ([drawn, guest]) =>
      Option.match(hostPortOf(drawn, guest), {
        onNone: () => !drawn.some((binding) => binding.guest === guest),
        onSome: (hostPort) => drawn.some((binding) => binding.guest === guest && binding.hostPort === hostPort),
      }),
  )

  it.prop(
    '∀p_PrefixSlash_≡Idempotent',
    [Schema.String],
    ([path]) => prefixSlash(prefixSlash(path)) === prefixSlash(path),
  )

  it.prop('∀p_PrefixSlash_∈Slashed', [Schema.String], ([path]) => prefixSlash(path).startsWith('/'))

  it.prop(
    '∀p_Normalize_≡Prefix',
    [Schema.String],
    ([path]) => normalizePath(path) === prefixSlash(path) && normalizePath(undefined) === '',
  )
}
