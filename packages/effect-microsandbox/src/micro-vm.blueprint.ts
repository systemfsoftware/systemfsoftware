import { Blueprint, Cell } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { type Context, Effect, Exit, Layer, Match, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
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

export { PortAllocator, type PortAllocatorShape } from './PortAllocator.js'

export { RuntimeResolver, type RuntimeResolverShape } from './RuntimeResolver.js'

export { SandboxRuntime, type SandboxRuntimeShape } from './SandboxRuntime.js'

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

export const TypeId = Symbol.for('~systemfsoftware/microvm/MicroVM')
export type TypeId = typeof TypeId

const runningVMOf = (vm: AcquiredVM): RunningVM =>
  makeRunningVM({
    name: vm.plan.name,
    portBindings: vm.plan.portBindings,
    sandbox: vm.sandbox,
  })

const scopedOf = (
  spec: MicroVMSpec,
): Effect.Effect<
  RunningVM,
  MicroVMError,
  Scope.Scope | Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber
> => Effect.map(bootMicroVM.run(spec), runningVMOf)

const layerOf = (spec: MicroVMSpec) =>
<Id>(
  service: Context.Key<Id, RunningVM>,
): Layer.Layer<Id, MicroVMError, Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber> =>
  Layer.effect(service)(scopedOf(spec))

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

const withEnvSpec = (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec =>
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
    Match.tag('Job', (j) => reviseJob(j, { env: { ...j.env, ...env } })),
    Match.exhaustive,
  )

const withExposedPortsSpec = (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec =>
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
  )

const withMountSpec = (spec: MicroVMSpec, mount: Mount): MicroVMSpec =>
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
    Match.tag('Job', (j) => reviseJob(j, { mounts: [...j.mounts, mount] })),
    Match.exhaustive,
  )

const withMemoryLimitSpec = (spec: MicroVMSpec, memoryMb: number): MicroVMSpec =>
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
    Match.tag('Job', (j) => reviseJob(j, { memoryMb })),
    Match.exhaustive,
  )

const withWaitStrategySpec = (spec: MicroVMSpec, waitStrategy: WaitStrategy): MicroVMSpec =>
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
  )
const Services = Blueprint.make<MicroVMSpec>()(TypeId).steps({
  steps: {
    withEnv: withEnvSpec,
    withExposedPorts: withExposedPortsSpec,
    withMount: withMountSpec,
    withMemoryLimit: withMemoryLimitSpec,
    withWaitStrategy: withWaitStrategySpec,
  },
  targets: { scoped: scopedOf, layer: layerOf },
})

const runJob = bootMicroVM.pipe(Cell.andThen(awaitJobCompletion))

const Jobs = Blueprint.make<JobSpec>()(TypeId).steps({
  steps: {
    withEnv: (spec: JobSpec, env: Record<string, string>): JobSpec => reviseJob(spec, { env: { ...spec.env, ...env } }),
    withExposedPorts: (spec: JobSpec, _ports: ReadonlyArray<number>): JobSpec => spec,
    withHostAccess: (spec: JobSpec, enabled: boolean): JobSpec => reviseJob(spec, { hostAccess: enabled }),
    withMemoryLimit: (spec: JobSpec, memoryMb: number): JobSpec => reviseJob(spec, { memoryMb }),
    withMount: (spec: JobSpec, mount: Mount): JobSpec => reviseJob(spec, { mounts: [...spec.mounts, mount] }),
    withWaitStrategy: (spec: JobSpec, _strategy: WaitStrategy): JobSpec => spec,
    withWorkdir: (spec: JobSpec, path: string): JobSpec => reviseJob(spec, { workdir: path }),
  },
  targets: { scoped: scopedOf, layer: layerOf, run: (spec: JobSpec) => runJob.run(spec) },
})

export type MicroVMBlueprint = Blueprint.Of<typeof Services>
export type JobBlueprint = Blueprint.Of<typeof Jobs>

export const withEnv = Services.operations.withEnv

export const withExposedPorts = Services.operations.withExposedPorts

export const withMount = Services.operations.withMount

export const withMemoryLimit = Services.operations.withMemoryLimit

export const withWaitStrategy = Services.operations.withWaitStrategy

export const withHostAccess = Jobs.operations.withHostAccess

export const withWorkdir = Jobs.operations.withWorkdir

export const service: {
  (ports?: ReadonlyArray<number>): (image: string) => MicroVMBlueprint
  (image: string, ports?: ReadonlyArray<number>): MicroVMBlueprint
} = dual(
  (args) => typeof args[0] === 'string',
  (image: string, ports: ReadonlyArray<number> = []): MicroVMBlueprint =>
    Services.of(new ServiceSpec({ image, ports, env: {}, mounts: [] })),
)

export const job: {
  (cmd: readonly [string, ...Array<string>]): (image: string) => JobBlueprint
  (image: string, cmd: readonly [string, ...Array<string>]): JobBlueprint
} = dual(
  2,
  (image: string, cmd: readonly [string, ...Array<string>]): JobBlueprint =>
    Jobs.of(new JobSpec({ image, cmd, env: {}, mounts: [] })),
)

export const make = (image: string): MicroVMBlueprint => service(image, [])
export const spec = make

const applyAll = (self: MicroVMBlueprint): MicroVMBlueprint =>
  self.pipe(
    withWaitStrategy(Wait.forPort(8080)),
    withMemoryLimit(512),
    withMount({ host: '/tmp/a', guest: '/data' }),
    withExposedPorts([6379]),
    withEnv({ K: 'V' }),
  )

const applyEnv = (self: MicroVMBlueprint, env: Record<string, string>): MicroVMBlueprint => withEnv(self, env)
const applyMemory = (self: MicroVMBlueprint, mb: number): MicroVMBlueprint => withMemoryLimit(self, mb)
const applyPorts = (self: MicroVMBlueprint, ports: ReadonlyArray<number>): MicroVMBlueprint =>
  withExposedPorts(self, ports)

if (import.meta.vitest !== void 0) {
  // The test-only dependencies cannot be imported statically: `import.meta.vitest` is only
  // defined when vitest transforms this file, so a static import would land in the bundle.
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const specEq = Schema.toEquivalence(MicroVMSpec)
  const positiveMb = Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))
  const guestPorts = Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique()))

  it.prop('∀spec_Combinators_=Pure', [MicroVMSpec], ([spec]) => {
    const next = applyAll(Services.of(spec)).spec
    return Exit.match(Schema.decodeExit(MicroVMSpec)(spec), {
      onSuccess: (twin) => specEq(applyAll(Services.of(twin)).spec, next) && !Object.is(next, spec),
      onFailure: () => false,
    })
  })

  const keyDraw = Arbitrary.schema(Schema.String)
  const distinctKeyPair = Arbitrary.flatMap(
    keyDraw,
    (k1) => Arbitrary.map(keyDraw, (k2) => [k1, `${k2}#${k1}`] as const),
  )

  it.prop('≤kk_EnvMerge_≡Assoc', [MicroVMSpec, distinctKeyPair], ([spec, [k1, k2]]) => {
    const sequential = applyEnv(applyEnv(Services.of(spec), { [k2]: 'v2' }), { [k1]: 'v1' }).spec
    const merged = applyEnv(Services.of(spec), { [k1]: 'v1', [k2]: 'v2' }).spec
    return specEq(sequential, merged)
  })

  it.prop(
    '∀spec_MemoryLimit_=Idempotent',
    [MicroVMSpec, positiveMb],
    ([spec, mb]) =>
      specEq(
        applyMemory(applyMemory(Services.of(spec), mb), mb).spec,
        applyMemory(Services.of(spec), mb).spec,
      ),
  )

  it.prop(
    '∀spec_Ports_=Idempotent',
    [MicroVMSpec, guestPorts],
    ([spec, ports]) =>
      specEq(
        applyPorts(applyPorts(Services.of(spec), ports), ports).spec,
        applyPorts(Services.of(spec), ports).spec,
      ),
  )

  it.prop(
    '∀job_Combinators_⊇HostAccessWorkdir',
    [JobSpec, Schema.Boolean, Schema.String],
    ([job, enabled, path]) => {
      const opted = withWorkdir(withHostAccess(Jobs.of(job), enabled), path)
      const next = applyAll(opted).spec
      return Match.value(next).pipe(
        Match.tag('Job', (revised) => revised.hostAccess === enabled && revised.workdir === path),
        Match.tag('Service', () => false),
        Match.exhaustive,
      )
    },
  )
}
