import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Resource } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Exit, Match, Option, Schema } from 'effect'
import * as Arr from 'effect/Array'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import { awaitJobCompletion } from './await-job-completion.cell.js'
import { awaitReadiness } from './await-readiness.cell.js'
import { bootMicroVM, type BootMicroVMError } from './boot-microvm.cell.js'
import { JobExited, type JobExitStatus, JobSignaled } from './classify-job-exit.workflow.js'
import { JobCompletion } from './JobCompletion.schema.js'
import { ExecError, PortAllocationError, SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
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
import type { PortBinding } from './render-sandbox-plan.schema.js'
import {
  awaitExit,
  exec,
  type ExecResult,
  type JobExit,
  type LogLine,
  logs,
  ping,
  port,
  RunningVM,
  type RunningVMType,
  url,
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

export {
  awaitExit,
  exec,
  type ExecResult,
  type JobExit,
  type LogLine,
  logs,
  ping,
  port,
  RunningVM,
  type RunningVMType,
  url,
}

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

const LOOPBACK_HOST = '127.0.0.1'

const allocateBinding = (guest: number) =>
  Effect.scoped(
    NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0 }).pipe(
      Effect.mapError((cause) => new PortAllocationError({ guestPort: guest, cause })),
      Effect.flatMap((server) => {
        const address = server.address
        return Option.match(Option.fromNullishOr('port' in address ? address.port : undefined), {
          onNone: () => Effect.fail(new PortAllocationError({ guestPort: guest })),
          onSome: (hostPort) => Effect.succeed<PortBinding>({ guest, host: LOOPBACK_HOST, hostPort }),
        })
      }),
    ),
  )

const allocateBindings = (guests: ReadonlyArray<number>) =>
  Effect.forEach(guests, (guest) => allocateBinding(guest), { concurrency: 'unbounded' })

const portsOf = (spec: MicroVMSpec): ReadonlyArray<number> =>
  Match.value(spec).pipe(
    Match.tag('Service', (service) => service.ports),
    Match.tag('Job', () => []),
    Match.exhaustive,
  )

const prepare = (spec: MicroVMSpec) =>
  Effect.flatMap(allocateBindings(portsOf(spec)), (bindings) => bootMicroVM.run({ spec, bindings }))

export const ServiceVMs: Resource.Kind<
  ServiceSpec,
  RunningVMType,
  BootMicroVMError | PortAllocationError | SandboxBootError | WaitTimeoutError,
  Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber,
  never,
  never,
  never
> = Resource.make({
  spec: ServiceSpec,
  handle: RunningVM,
  prepare,
  ready: (vm, spec) => awaitReadiness.run({ vm, spec }),
})

export const JobVMs = Resource.make({ spec: JobSpec, handle: RunningVM, prepare })

export type ServiceResource = Resource.Of<typeof ServiceVMs>
export type JobResource = Resource.Of<typeof JobVMs>

export const service: {
  (ports?: ReadonlyArray<number>): (image: string) => ServiceResource
  (image: string, ports?: ReadonlyArray<number>): ServiceResource
} = dual(
  (args) => typeof args[0] === 'string',
  (image: string, ports: ReadonlyArray<number> = []): ServiceResource =>
    ServiceVMs.of(new ServiceSpec({ image, ports, env: {}, mounts: [] })),
)

export const job: {
  (cmd: readonly [string, ...Array<string>]): (image: string) => JobResource
  (image: string, cmd: readonly [string, ...Array<string>]): JobResource
} = dual(
  2,
  (image: string, cmd: readonly [string, ...Array<string>]): JobResource =>
    JobVMs.of(new JobSpec({ image, cmd, env: {}, mounts: [] })),
)

export const spec = (image: string): ServiceResource => service(image, [])

type ServiceFields = ConstructorParameters<typeof ServiceSpec>[0]
type JobFields = ConstructorParameters<typeof JobSpec>[0]
type SharedPatch = Partial<Pick<ServiceFields, 'env' | 'mounts' | 'memoryMb' | 'vCPUs'>>

const reviseService = (spec: ServiceSpec, patch: Partial<ServiceFields>): ServiceSpec =>
  new ServiceSpec({
    image: spec.image,
    env: spec.env,
    mounts: spec.mounts,
    memoryMb: spec.memoryMb,
    vCPUs: spec.vCPUs,
    ports: spec.ports,
    waitStrategy: spec.waitStrategy,
    ...patch,
  })

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

const revise = (spec: ServiceSpec | JobSpec, patch: SharedPatch): ServiceSpec | JobSpec =>
  Match.value(spec).pipe(
    Match.tag('Service', (service) => reviseService(service, patch)),
    Match.tag('Job', (job) => reviseJob(job, patch)),
    Match.exhaustive,
  )

const rebuild = (spec: ServiceSpec | JobSpec): ServiceResource | JobResource =>
  Match.value(spec).pipe(
    Match.tag('Service', (service) => ServiceVMs.of(service)),
    Match.tag('Job', (job) => JobVMs.of(job)),
    Match.exhaustive,
  )

const withEnvBody = (
  self: ServiceResource | JobResource,
  env: Record<string, string>,
): ServiceResource | JobResource => rebuild(revise(self.spec, { env: { ...self.spec.env, ...env } }))

export const withEnv: {
  <R extends ServiceResource | JobResource>(env: Record<string, string>): (self: R) => R
  <R extends ServiceResource | JobResource>(self: R, env: Record<string, string>): R
} = dual(2, withEnvBody)

export const withExposedPorts: {
  (ports: ReadonlyArray<number>): (self: ServiceResource) => ServiceResource
  (self: ServiceResource, ports: ReadonlyArray<number>): ServiceResource
} = dual(
  2,
  (self: ServiceResource, ports: ReadonlyArray<number>): ServiceResource =>
    ServiceVMs.of(reviseService(self.spec, { ports })),
)

export const withMount: {
  <R extends ServiceResource | JobResource>(mount: Mount): (self: R) => R
  <R extends ServiceResource | JobResource>(self: R, mount: Mount): R
} = dual(
  2,
  (self: ServiceResource | JobResource, mount: Mount): ServiceResource | JobResource =>
    rebuild(revise(self.spec, { mounts: [...self.spec.mounts, mount] })),
)

export const withMemoryLimit: {
  <R extends ServiceResource | JobResource>(memoryMb: number): (self: R) => R
  <R extends ServiceResource | JobResource>(self: R, memoryMb: number): R
} = dual(
  2,
  (self: ServiceResource | JobResource, memoryMb: number): ServiceResource | JobResource =>
    rebuild(revise(self.spec, { memoryMb })),
)

export const withWaitStrategy: {
  (waitStrategy: WaitStrategy): (self: ServiceResource) => ServiceResource
  (self: ServiceResource, waitStrategy: WaitStrategy): ServiceResource
} = dual(
  2,
  (self: ServiceResource, waitStrategy: WaitStrategy): ServiceResource =>
    ServiceVMs.of(reviseService(self.spec, { waitStrategy })),
)

export const withHostAccess: {
  (enabled: boolean): (self: JobResource) => JobResource
  (self: JobResource, enabled: boolean): JobResource
} = dual(
  2,
  (self: JobResource, enabled: boolean): JobResource => JobVMs.of(reviseJob(self.spec, { hostAccess: enabled })),
)

export const withWorkdir: {
  (path: string): (self: JobResource) => JobResource
  (self: JobResource, path: string): JobResource
} = dual(2, (self: JobResource, path: string): JobResource => JobVMs.of(reviseJob(self.spec, { workdir: path })))

export const run = (
  self: JobResource,
): Effect.Effect<
  JobCompletion,
  BootMicroVMError | ExecError | PortAllocationError | SandboxBootError,
  Crypto.Crypto | FileSystem.FileSystem | Scope.Scope
> => Effect.flatMap(self.scoped, (vm) => awaitJobCompletion.run({ vm, spec: self.spec }))

const applyAll = (resource: ServiceResource): ServiceResource =>
  resource.pipe(
    withEnv({ K: 'V' }),
    withExposedPorts([6379]),
    withMount({ host: '/tmp/a', guest: '/data' }),
    withMemoryLimit(512),
    withWaitStrategy(Wait.forPort(8080)),
  )

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const serviceEq = Schema.toEquivalence(ServiceSpec)
  const specEq = Schema.toEquivalence(MicroVMSpec)
  const positiveMb = Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))
  const guestPorts = Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique()))

  it.prop('∀service_Combinators_=Pure', [ServiceSpec], ([spec]) => {
    const next = applyAll(ServiceVMs.of(spec))
    return Exit.match(Schema.decodeExit(ServiceSpec)(spec), {
      onSuccess: (twin) => serviceEq(next.spec, applyAll(ServiceVMs.of(twin)).spec) && !Object.is(next.spec, spec),
      onFailure: () => false,
    })
  })

  const keyDraw = Arbitrary.schema(Schema.String)
  const distinctKeyPair = Arbitrary.flatMap(
    keyDraw,
    (k1) => Arbitrary.map(keyDraw, (k2) => [k1, `${k2}#${k1}`] as const),
  )

  it.prop('≤kk_EnvMerge_≡Assoc', [MicroVMSpec, distinctKeyPair], ([spec, [k1, k2]]) => {
    const sequential = rebuild(spec).pipe(withEnv({ [k2]: 'v2' }), withEnv({ [k1]: 'v1' }))
    const merged = rebuild(spec).pipe(withEnv({ [k1]: 'v1', [k2]: 'v2' }))
    return specEq(sequential.spec, merged.spec)
  })

  it.prop(
    '∀spec_MemoryLimit_=Idempotent',
    [MicroVMSpec, positiveMb],
    ([spec, mb]) =>
      specEq(
        rebuild(spec).pipe(withMemoryLimit(mb), withMemoryLimit(mb)).spec,
        rebuild(spec).pipe(withMemoryLimit(mb)).spec,
      ),
  )

  it.prop(
    '∀service_Ports_=Idempotent',
    [ServiceSpec, guestPorts],
    ([spec, ports]) =>
      serviceEq(
        ServiceVMs.of(spec).pipe(withExposedPorts(ports), withExposedPorts(ports)).spec,
        ServiceVMs.of(spec).pipe(withExposedPorts(ports)).spec,
      ),
  )

  it.prop(
    '∀job_Combinators_⊇HostAccessWorkdir',
    [JobSpec, Schema.Boolean, Schema.String],
    ([job, enabled, path]) => {
      const revised = JobVMs.of(job).pipe(withHostAccess(enabled), withWorkdir(path), withEnv({ J: '1' })).spec
      return Arr.every(
        [revised.hostAccess === enabled, revised.workdir === path, revised.env['J'] === '1'],
        (verdict) => verdict,
      )
    },
  )
}
