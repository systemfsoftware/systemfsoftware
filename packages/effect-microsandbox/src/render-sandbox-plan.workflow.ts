import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import { GuestPort, MicroVMSpec } from './MicroVMSpec.schema.js'
import { PortBinding, SandboxPlan } from './render-sandbox-plan.schema.js'

const PlanTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-microsandbox/SandboxPlanDecision')
type PlanTypeId = typeof PlanTypeId

export class PlanApproved extends Schema.TaggedClass<PlanApproved>()('PlanApproved', {
  plan: SandboxPlan,
}) {
  readonly [PlanTypeId] = PlanTypeId
}

export class PlanRefused extends Schema.TaggedClass<PlanRefused>()('PlanRefused', {
  sandboxName: Schema.String,
  host: Schema.String,
  guestPort: GuestPort,
}) {
  readonly [PlanTypeId] = PlanTypeId
}

export const SandboxPlanDecision = Schema.Union([PlanApproved, PlanRefused])
export type SandboxPlanDecision = typeof SandboxPlanDecision.Type

export class PlanSandbox extends Schema.TaggedClass<PlanSandbox>()('PlanSandbox', {
  spec: MicroVMSpec,
  bindings: Schema.Array(PortBinding),
  name: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { name: 'microsandbox.sandbox.name' } as const
}

const HOST_ACCESS_PROFILES = ['public', 'host'] as const

const networkProfilesOf = (hostAccess: boolean | undefined): ReadonlyArray<'public' | 'host'> | undefined =>
  Match.value(hostAccess).pipe(
    Match.when(true, (): ReadonlyArray<'public' | 'host'> => HOST_ACCESS_PROFILES),
    Match.orElse((): undefined => undefined),
  )

const LOOPBACK_PREFIX = '127.'

const isLoopback = (host: string): boolean => host.startsWith(LOOPBACK_PREFIX)

const illegalBinding = (bindings: ReadonlyArray<PortBinding>): Option.Option<PortBinding> =>
  Arr.findFirst(bindings, (binding) => !isLoopback(binding.host))

const planOf = (command: PlanSandbox): SandboxPlan =>
  Match.value(command.spec).pipe(
    Match.tag('Job', (job) => ({
      name: command.name,
      image: job.image,
      envs: { ...job.env },
      cpus: job.vCPUs,
      memoryMiB: job.memoryMb,
      workdir: job.workdir,
      cmd: [...job.cmd],
      mounts: job.mounts.map((mount) => ({ guest: mount.guest, host: mount.host })),
      portBindings: [],
      networkProfiles: networkProfilesOf(job.hostAccess),
    })),
    Match.tag('Service', (service) => ({
      name: command.name,
      image: service.image,
      envs: { ...service.env },
      cpus: service.vCPUs,
      memoryMiB: service.memoryMb,
      workdir: undefined,
      cmd: undefined,
      mounts: service.mounts.map((mount) => ({ guest: mount.guest, host: mount.host })),
      portBindings: command.bindings.map((binding) => ({ ...binding })),
    })),
    Match.exhaustive,
  )

export const renderSandboxPlan = Workflow.make({
  command: PlanSandbox,
  decision: SandboxPlanDecision,
  error: Schema.Never,
  decide: (command): Result.Result<SandboxPlanDecision, never> =>
    Match.value(illegalBinding(command.bindings)).pipe(
      Match.tag('Some', ({ value }) =>
        Result.succeed(
          PlanRefused.make({ sandboxName: command.name, host: value.host, guestPort: value.guest }),
        )),
      Match.tag('None', () => Result.succeed(PlanApproved.make({ plan: planOf(command) }))),
      Match.exhaustive,
    ),
})
