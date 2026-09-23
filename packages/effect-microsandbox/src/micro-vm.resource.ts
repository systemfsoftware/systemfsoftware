import { Cell } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { type Context, Effect, Exit, Layer, Match, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as Scope from 'effect/Scope'
import { awaitJobCompletion } from './await-job-completion.cell.js'
import { bootMicroVM } from './boot-microvm.cell.js'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { JobExited, type JobExitStatus, JobSignaled } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import type { MicroVMError } from './MicroVMError.schema.js'
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
import {
  exec,
  type ExecResult,
  isRunningVM,
  type LogLine,
  logs,
  make as makeRunningVM,
  ping,
  port,
  type RunningVM,
  TypeId as RunningVMTypeId,
  url,
  use,
} from './running-vm.handle.js'
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

export { exec, type ExecResult, isRunningVM, type LogLine, logs, ping, port, type RunningVM, RunningVMTypeId, url, use }

export { JobCompletion, JobExited, type JobExitStatus, JobSignaled }

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
    Scope.Scope | Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber
  >
  layer<Id>(
    service: Context.Key<Id, RunningVM>,
  ): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem>
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
    layer<Id>(
      service: Context.Key<Id, RunningVM>,
    ): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem> {
      return Layer.provide(Readiness.NodeHostProber)(Layer.effect(service)(scoped(raw)))
    },
  }
  return self
}

export interface JobResource extends MicroVMResource {
  withExposedPorts(ports: ReadonlyArray<number>): JobResource
  withEnv(env: Record<string, string>): JobResource
  withMount(mount: Mount): JobResource
  withMemoryLimit(memoryMb: number): JobResource
  withWaitStrategy(waitStrategy: WaitStrategy): JobResource
  withHostAccess(enabled: boolean): JobResource
  withWorkdir(path: string): JobResource
  readonly run: Effect.Effect<
    JobCompletion,
    MicroVMError,
    Scope.Scope | Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber
  >
}

const runJob = bootMicroVM.pipe(Cell.andThen(awaitJobCompletion))

const makeJobProto = (raw: JobSpec): JobResource => {
  const self: JobResource = {
    [TypeId]: TypeId,
    spec: raw,
    ...Prototype,
    withExposedPorts(): JobResource {
      return self
    },
    withEnv(env: Record<string, string>): JobResource {
      return makeJobProto(jobWithEnv(raw, env))
    },
    withMount(mount: Mount): JobResource {
      return makeJobProto(jobWithMount(raw, mount))
    },
    withMemoryLimit(memoryMb: number): JobResource {
      return makeJobProto(jobWithMemoryLimit(raw, memoryMb))
    },
    withWaitStrategy(): JobResource {
      return self
    },
    withHostAccess(enabled: boolean): JobResource {
      return makeJobProto(withHostAccess(raw, enabled))
    },
    withWorkdir(path: string): JobResource {
      return makeJobProto(withWorkdir(raw, path))
    },
    get scoped() {
      return scoped(raw)
    },
    layer<Id>(
      service: Context.Key<Id, RunningVM>,
    ): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem> {
      return Layer.provide(Readiness.NodeHostProber)(Layer.effect(service)(scoped(raw)))
    },
    get run() {
      return runJob.run(raw)
    },
  }
  return self
}

const runningVMOf = (vm: AcquiredVM): RunningVM =>
  makeRunningVM({
    name: vm.plan.name,
    portBindings: vm.plan.portBindings,
    sandbox: vm.sandbox,
  })
export const scoped = (
  spec: MicroVMSpec,
): Effect.Effect<
  RunningVM,
  MicroVMError,
  Scope.Scope | Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber
> => Effect.map(bootMicroVM.run(spec), runningVMOf)

export const layer: {
  <Id>(
    service: Context.Key<Id, RunningVM>,
  ): (spec: MicroVMSpec) => Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem>
  <Id>(
    service: Context.Key<Id, RunningVM>,
    spec: MicroVMSpec,
  ): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem>
} = dual(
  (args) => args.length >= 2,
  <Id>(
    service: Context.Key<Id, RunningVM>,
    spec: MicroVMSpec,
  ): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem> =>
    Layer.provide(Readiness.NodeHostProber)(Layer.effect(service)(scoped(spec))),
)
export const service: {
  (ports?: ReadonlyArray<number>): (image: string) => MicroVMResource
  (image: string, ports?: ReadonlyArray<number>): MicroVMResource
} = dual(
  (args) => typeof args[0] === 'string',
  (image: string, ports: ReadonlyArray<number> = []): MicroVMResource =>
    makeProto(new ServiceSpec({ image, ports, env: {}, mounts: [] })),
)

export const job: {
  (cmd: readonly [string, ...Array<string>]): (image: string) => JobResource
  (image: string, cmd: readonly [string, ...Array<string>]): JobResource
} = dual(
  2,
  (image: string, cmd: readonly [string, ...Array<string>]): JobResource =>
    makeJobProto(new JobSpec({ image, cmd, env: {}, mounts: [] })),
)

export const make = (image: string): MicroVMResource => service(image, [])
export const spec = make

type JobFields = ConstructorParameters<typeof JobSpec>[0]

const reviseJob = (job: JobSpec, patch: Partial<JobFields>): JobSpec =>
  new JobSpec({
    image: job.image,
    env: job.env,
    cmd: job.cmd,
    mounts: job.mounts,
    memoryMb: job.memoryMb,
    vCPUs: job.vCPUs,
    workdir: job.workdir,
    hostAccess: job.hostAccess,
    ...patch,
  })

const jobWithEnv = (job: JobSpec, env: Record<string, string>): JobSpec =>
  reviseJob(job, { env: { ...job.env, ...env } })
const jobWithMount = (job: JobSpec, mount: Mount): JobSpec => reviseJob(job, { mounts: [...job.mounts, mount] })
const jobWithMemoryLimit = (job: JobSpec, memoryMb: number): JobSpec => reviseJob(job, { memoryMb })

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
    Match.tag('Job', (j) => jobWithEnv(j, env)),
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
    Match.tag('Job', (j) => jobWithMount(j, mount)),
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
    Match.tag('Job', (j) => jobWithMemoryLimit(j, memoryMb)),
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

export const withHostAccess: {
  (enabled: boolean): (spec: JobSpec) => JobSpec
  (spec: JobSpec, enabled: boolean): JobSpec
} = dual(2, (spec: JobSpec, enabled: boolean): JobSpec => reviseJob(spec, { hostAccess: enabled }))

export const withWorkdir: {
  (path: string): (spec: JobSpec) => JobSpec
  (spec: JobSpec, path: string): JobSpec
} = dual(2, (spec: JobSpec, path: string): JobSpec => reviseJob(spec, { workdir: path }))

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

  it.prop(
    '∀job_Combinators_⊇HostAccessWorkdir',
    [JobSpec, Schema.Boolean, Schema.String],
    ([job, enabled, path]) => {
      const opted = withWorkdir(withHostAccess(job, enabled), path)
      const next = applyAll(opted)
      return Match.value(next).pipe(
        Match.tag('Job', (revised) => revised.hostAccess === enabled && revised.workdir === path),
        Match.tag('Service', () => false),
        Match.exhaustive,
      )
    },
  )
}
