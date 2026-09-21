import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { GuestPort, MicroVMSpec } from './MicroVMSpec.schema.js'

export const PortBinding = Schema.Struct({
  guest: GuestPort,
  host: Schema.String,
  hostPort: Schema.Int,
})
export type PortBinding = typeof PortBinding.Type

export const SandboxPlan = Schema.Struct({
  name: Schema.String,
  image: Schema.String,
  envs: Schema.Record(Schema.String, Schema.String),
  cpus: Schema.optional(Schema.Int),
  memoryMiB: Schema.optional(Schema.Finite),
  workdir: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.Array(Schema.String)),
  mounts: Schema.Array(Schema.Struct({ guest: Schema.String, host: Schema.String })),
  portBindings: Schema.Array(PortBinding),
})
export type SandboxPlan = typeof SandboxPlan.Type

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

export type SandboxPlanDecision = PlanApproved | PlanRefused

export class PlanSandbox extends Schema.TaggedClass<PlanSandbox>()('PlanSandbox', {
  spec: MicroVMSpec,
  bindings: Schema.Array(PortBinding),
  name: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['name'] as const
}

const LOOPBACK_HOST = '127.0.0.1'
const LOOPBACK_PREFIX = '127.'

const isLoopback = (host: string): boolean => [host === LOOPBACK_HOST, host.startsWith(LOOPBACK_PREFIX)].some(Boolean)

const illegalBinding = (bindings: ReadonlyArray<PortBinding>): Option.Option<PortBinding> =>
  Option.fromNullishOr(bindings.find((binding) => !isLoopback(binding.host)))

const cmdOf = (spec: MicroVMSpec): ReadonlyArray<string> | undefined =>
  Option.match(Option.fromNullishOr(spec.cmd), {
    onNone: () => undefined,
    onSome: (cmd) => [...cmd],
  })

const planOf = (command: PlanSandbox): SandboxPlan => ({
  name: command.name,
  image: command.spec.image,
  envs: { ...command.spec.env },
  cpus: command.spec.vCPUs,
  memoryMiB: command.spec.memoryMb,
  workdir: command.spec.workdir,
  cmd: cmdOf(command.spec),
  mounts: command.spec.mounts.map((mount) => ({ guest: mount.guest, host: mount.host })),
  portBindings: command.bindings.map((binding) => ({ ...binding })),
})

export const renderSandboxPlan = Workflow.total(
  PlanSandbox,
  (command): Result.Result<SandboxPlanDecision, never> =>
    Match.value(illegalBinding(command.bindings)).pipe(
      Match.tag('Some', ({ value }) =>
        Result.succeed(
          PlanRefused.make({ sandboxName: command.name, host: value.host, guestPort: value.guest }),
        )),
      Match.tag('None', () => Result.succeed(PlanApproved.make({ plan: planOf(command) }))),
      Match.exhaustive,
    ),
)
