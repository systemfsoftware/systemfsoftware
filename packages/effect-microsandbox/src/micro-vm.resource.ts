import { Effect, Exit, HashMap, Layer, Match, Option, Schema, Stream } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as Scope from 'effect/Scope'
import type { Sandbox } from 'microsandbox'
import { bootMicroVM } from './boot-microvm.cell.js'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { ExecError, type MicroVMError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import {
  ExposedPort,
  GuestPort,
  HttpWait,
  ImageReference,
  JobSpec,
  LogWait,
  MicroVMSpec,
  type Mount,
  PortProbe,
  PortWait,
  ServiceSpec,
  type WaitStrategy,
} from './MicroVMSpec.schema.js'
import { type ExecResult, type LogLine, type RunningVM, RunningVM as RunningVMTag } from './running-vm.handle.js'
export {
  ExposedPort,
  GuestPort,
  HttpWait,
  ImageReference,
  JobSpec,
  LogWait,
  MicroVMSpec,
  type Mount,
  PortProbe,
  PortWait,
  ServiceSpec,
  type WaitStrategy,
}

export { type ExecResult, type LogLine, RunningVMTag as RunningVM }

export const Port = {
  of: (port: number): ExposedPort => new ExposedPort({ port }),
  tcp: (port: number): ExposedPort => new ExposedPort({ port, probe: { _tag: 'Tcp' } }),
  http: (port: number, path = '/'): ExposedPort => new ExposedPort({ port, probe: { _tag: 'Http', path } }),
}

export const Wait = {
  forHttp: (path: string, port: number): WaitStrategy => ({ _tag: 'Http', path, port }),
  forPort: (port: number): WaitStrategy => ({ _tag: 'Port', port }),
  forLog: (pattern: string): WaitStrategy => ({ _tag: 'Log', pattern }),
}

const TypeId = '~systemfsoftware/microvm/MicroVM'
export type TypeId = typeof TypeId

export interface MicroVMResource extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly spec: MicroVMSpec
  withExposedPorts(ports: ReadonlyArray<number>): MicroVMResource
  withEnv(env: Record<string, string>): MicroVMResource
  withMount(mount: Mount): MicroVMResource
  withMemoryLimit(memoryMb: number): MicroVMResource
  withWaitStrategy(waitStrategy: WaitStrategy): MicroVMResource
  readonly scoped: Effect.Effect<
    RunningVM,
    MicroVMError,
    Scope.Scope | Crypto.Crypto | FileSystem.FileSystem
  >
  readonly layer: Layer.Layer<RunningVM, MicroVMError, Crypto.Crypto | FileSystem.FileSystem>
}

const makeProto = (raw: MicroVMSpec): MicroVMResource => {
  const self: MicroVMResource = {
    [TypeId]: TypeId,
    spec: raw,
    ...Prototype,
    withExposedPorts(ports: ReadonlyArray<number>): MicroVMResource {
      return makeProto(withExposedPorts(raw, ports))
    },
    withEnv(env: Record<string, string>): MicroVMResource {
      return makeProto(withEnv(raw, env))
    },
    withMount(mount: Mount): MicroVMResource {
      return makeProto(withMount(raw, mount))
    },
    withMemoryLimit(memoryMb: number): MicroVMResource {
      return makeProto(withMemoryLimit(raw, memoryMb))
    },
    withWaitStrategy(waitStrategy: WaitStrategy): MicroVMResource {
      return makeProto(withWaitStrategy(raw, waitStrategy))
    },
    get scoped() {
      return scoped(raw)
    },
    get layer() {
      return layer(raw)
    },
  }
  return self
}

const execOf =
  (sandbox: Sandbox) => (cmd: string, args: ReadonlyArray<string> = []): Effect.Effect<ExecResult, ExecError> => {
    const argv = [cmd, ...args]
    return Effect.map(
      Effect.tryPromise({
        try: () => sandbox.exec(cmd, [...args]),
        catch: (cause) => new ExecError({ argv, cause }),
      }),
      (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
    )
  }

const logsOf = (sandbox: Sandbox): Stream.Stream<LogLine, SandboxBootError> =>
  Stream.flatMap(
    Stream.fromEffect(
      Effect.tryPromise({
        try: () => sandbox.logStream({ follow: true }),
        catch: (cause) => new SandboxBootError({ sandboxName: sandbox.name, cause }),
      }),
    ),
    (logStream) =>
      Stream.fromAsyncIterable(logStream, (cause) => new SandboxBootError({ sandboxName: sandbox.name, cause })),
  ).pipe(
    Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() })),
  )

const runningVMOf = (vm: AcquiredVM): RunningVM => {
  const mappedPorts = HashMap.fromIterable(
    vm.plan.portBindings.map((binding) => [binding.guest, binding.hostPort] as const),
  )

  const port = (guestPort: number): Effect.Effect<number, PortAllocationError> =>
    Effect.fromOption(HashMap.get(mappedPorts, guestPort)).pipe(
      Effect.mapError(
        () =>
          new PortAllocationError({
            guestPort,
            cause: `Guest port ${guestPort} is not mapped to any host port on sandbox ${vm.plan.name}`,
          }),
      ),
    )

  const url = (guestPort: number, path = ''): Effect.Effect<string, PortAllocationError> =>
    Effect.map(port(guestPort), (hostPort) => `http://127.0.0.1:${hostPort}${path.startsWith('/') ? path : `/${path}`}`)

  return {
    name: vm.plan.name,
    mappedPorts,
    port,
    url,
    exec: execOf(vm.sandbox),
    logs: logsOf(vm.sandbox),
    ping: Effect.map(Effect.option(Effect.promise(() => vm.sandbox.ping())), Option.isSome),
  }
}

export const scoped = (
  spec: MicroVMSpec,
): Effect.Effect<
  RunningVM,
  MicroVMError,
  Scope.Scope | Crypto.Crypto | FileSystem.FileSystem
> => Effect.map(bootMicroVM.run(spec), runningVMOf)

export const layer = (
  spec: MicroVMSpec,
): Layer.Layer<RunningVM, MicroVMError, Crypto.Crypto | FileSystem.FileSystem> =>
  Layer.effect(RunningVMTag, scoped(spec))
export const service = (image: string, ports: ReadonlyArray<number> = []): MicroVMResource =>
  makeProto(new ServiceSpec({ image, ports, env: {}, mounts: [] }))

export const job = (image: string, cmd: readonly [string, ...Array<string>]): MicroVMResource =>
  makeProto(new JobSpec({ image, cmd, env: {}, mounts: [] }))

export const make = (image: string): MicroVMResource => service(image, [])
export const spec = make

export const withEnv: {
  (env: Record<string, string>): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (s) =>
      new ServiceSpec({
        image: s.image,
        env: { ...s.env, ...env },
        ports: s.ports,
        mounts: s.mounts,
        memoryMb: s.memoryMb,
        vCPUs: s.vCPUs,
        waitStrategy: s.waitStrategy,
      })),
    Match.tag('Job', (j) =>
      new JobSpec({
        image: j.image,
        env: { ...j.env, ...env },
        cmd: j.cmd,
        mounts: j.mounts,
        memoryMb: j.memoryMb,
        vCPUs: j.vCPUs,
        workdir: j.workdir,
      })),
    Match.exhaustive,
  ))

export const withExposedPorts: {
  (ports: ReadonlyArray<number>): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (s) =>
      new ServiceSpec({
        image: s.image,
        env: s.env,
        ports,
        mounts: s.mounts,
        memoryMb: s.memoryMb,
        vCPUs: s.vCPUs,
        waitStrategy: s.waitStrategy,
      })),
    Match.tag('Job', (j) => j),
    Match.exhaustive,
  ))

export const withMount: {
  (mount: Mount): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, mount: Mount): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, mount: Mount): MicroVMSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (s) =>
      new ServiceSpec({
        image: s.image,
        env: s.env,
        ports: s.ports,
        mounts: [...s.mounts, mount],
        memoryMb: s.memoryMb,
        vCPUs: s.vCPUs,
        waitStrategy: s.waitStrategy,
      })),
    Match.tag('Job', (j) =>
      new JobSpec({
        image: j.image,
        env: j.env,
        cmd: j.cmd,
        mounts: [...j.mounts, mount],
        memoryMb: j.memoryMb,
        vCPUs: j.vCPUs,
        workdir: j.workdir,
      })),
    Match.exhaustive,
  ))

export const withMemoryLimit: {
  (memoryMb: number): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, memoryMb: number): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, memoryMb: number): MicroVMSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (s) =>
      new ServiceSpec({
        image: s.image,
        env: s.env,
        ports: s.ports,
        mounts: s.mounts,
        memoryMb,
        vCPUs: s.vCPUs,
        waitStrategy: s.waitStrategy,
      })),
    Match.tag('Job', (j) =>
      new JobSpec({
        image: j.image,
        env: j.env,
        cmd: j.cmd,
        mounts: j.mounts,
        memoryMb,
        vCPUs: j.vCPUs,
        workdir: j.workdir,
      })),
    Match.exhaustive,
  ))

export const withWaitStrategy: {
  (waitStrategy: WaitStrategy): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, waitStrategy: WaitStrategy): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, waitStrategy: WaitStrategy): MicroVMSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (s) =>
      new ServiceSpec({
        image: s.image,
        env: s.env,
        ports: s.ports,
        mounts: s.mounts,
        memoryMb: s.memoryMb,
        vCPUs: s.vCPUs,
        waitStrategy,
      })),
    Match.tag('Job', (j) => j),
    Match.exhaustive,
  ))
const applyAll = (spec: MicroVMSpec): MicroVMSpec =>
  withEnv({ K: 'V' })(
    withExposedPorts([6379])(
      withMount({ host: '/tmp/a', guest: '/data' })(withMemoryLimit(512)(withWaitStrategy(Wait.forPort(8080))(spec))),
    ),
  )

const applyEnv = (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec => withEnv(spec, env)
const applyMemory = (spec: MicroVMSpec, mb: number): MicroVMSpec => withMemoryLimit(spec, mb)
const applyPorts = (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec => withExposedPorts(spec, ports)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const specEq = Schema.toEquivalence(MicroVMSpec)
  const positiveMb = Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))
  const guestPorts = Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique()))

  it.prop('∀spec_Combinators_=Pure', [MicroVMSpec], ([spec]) => {
    const next = applyAll(spec)
    return Exit.match(Schema.decodeExit(MicroVMSpec)(spec), {
      onSuccess: (twin) => specEq(applyAll(twin), next) && !Object.is(next, spec),
      onFailure: () => false,
    })
  })

  const keyDraw = Arbitrary.schema(Schema.String)
  const distinctKeyPair = Arbitrary.flatMap(
    keyDraw,
    (k1) => Arbitrary.map(keyDraw, (k2) => [k1, `${k2}#${k1}`] as const),
  )

  it.prop('≤kk_EnvMerge_≡Assoc', [MicroVMSpec, distinctKeyPair], ([spec, [k1, k2]]) => {
    const sequential = applyEnv(applyEnv(spec, { [k2]: 'v2' }), { [k1]: 'v1' })
    const merged = applyEnv(spec, { [k1]: 'v1', [k2]: 'v2' })
    return specEq(sequential, merged)
  })

  it.prop(
    '∀spec_MemoryLimit_=Idempotent',
    [MicroVMSpec, positiveMb],
    ([spec, mb]) => specEq(applyMemory(applyMemory(spec, mb), mb), applyMemory(spec, mb)),
  )

  it.prop(
    '∀spec_Ports_=Idempotent',
    [MicroVMSpec, guestPorts],
    ([spec, ports]) => specEq(applyPorts(applyPorts(spec, ports), ports), applyPorts(spec, ports)),
  )
}
