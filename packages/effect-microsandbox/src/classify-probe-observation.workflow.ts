import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const ProbeObservationTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-microsandbox/ProbeObservation',
)
type ProbeObservationTypeId = typeof ProbeObservationTypeId

export class KvmAccessible extends Schema.TaggedClass<KvmAccessible>()('KvmAccessible', {}) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export class KvmDenied extends Schema.TaggedClass<KvmDenied>()('KvmDenied', { topology: Schema.String }) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export class KvmAbsent extends Schema.TaggedClass<KvmAbsent>()('KvmAbsent', { topology: Schema.String }) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export class HvfUnavailable extends Schema.TaggedClass<HvfUnavailable>()('HvfUnavailable', { arch: Schema.String }) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export class WHPUnavailable extends Schema.TaggedClass<WHPUnavailable>()('WHPUnavailable', {
  topology: Schema.String,
}) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export class PlatformUnsupported extends Schema.TaggedClass<PlatformUnsupported>()('PlatformUnsupported', {
  platform: Schema.String,
  arch: Schema.String,
}) {
  readonly [ProbeObservationTypeId] = ProbeObservationTypeId
}

export const ProbeObservation = Schema.Union([
  KvmAccessible,
  KvmDenied,
  KvmAbsent,
  HvfUnavailable,
  WHPUnavailable,
  PlatformUnsupported,
])
export type ProbeObservation = typeof ProbeObservation.Type

export class KvmDeviceFacts extends Schema.TaggedClass<KvmDeviceFacts>()('KvmDeviceFacts', {
  accessible: Schema.Boolean,
  present: Schema.Boolean,
}) {}

export class VmcomputeFacts extends Schema.TaggedClass<VmcomputeFacts>()('VmcomputeFacts', {
  present: Schema.Boolean,
}) {}

export class AppleHypervisorFacts extends Schema.TaggedClass<AppleHypervisorFacts>()('AppleHypervisorFacts', {
  arch: Schema.String,
}) {}

export class NoProbeForPlatform extends Schema.TaggedClass<NoProbeForPlatform>()('NoProbeForPlatform', {
  arch: Schema.String,
}) {}

export const ProbeFacts = Schema.Union([KvmDeviceFacts, VmcomputeFacts, AppleHypervisorFacts, NoProbeForPlatform])
export type ProbeFacts = typeof ProbeFacts.Type

export class ClassifyProbeObservation extends Schema.TaggedClass<ClassifyProbeObservation>()(
  'ClassifyProbeObservation',
  {
    platform: Schema.String,
    facts: ProbeFacts,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = { platform: 'microsandbox.virtualization.platform' } as const
}

const kvmObservationOf = (facts: KvmDeviceFacts): ProbeObservation =>
  Match.value(facts.accessible).pipe(
    Match.when(true, () => new KvmAccessible({})),
    Match.when(false, () => kvmDenialOrAbsenceOf(facts.present)),
    Match.exhaustive,
  )

const kvmDenialOrAbsenceOf = (present: boolean): ProbeObservation =>
  Match.value(present).pipe(
    Match.when(true, () => new KvmDenied({ topology: 'kvm exists=true rw=false' })),
    Match.when(false, () => new KvmAbsent({ topology: 'kvm exists=false' })),
    Match.exhaustive,
  )

const vmcomputeObservationOf = (facts: VmcomputeFacts): ProbeObservation =>
  Match.value(facts.present).pipe(
    Match.when(true, () => new KvmAccessible({})),
    Match.when(false, () => new WHPUnavailable({ topology: 'vmcompute present=false' })),
    Match.exhaustive,
  )

const hypervisorObservationOf = (facts: AppleHypervisorFacts): ProbeObservation =>
  Match.value(facts.arch === 'arm64').pipe(
    Match.when(true, () => new KvmAccessible({})),
    Match.when(false, () => new HvfUnavailable({ arch: facts.arch })),
    Match.exhaustive,
  )

const observationOf = (command: ClassifyProbeObservation): ProbeObservation =>
  Match.value(command.facts).pipe(
    Match.tag('KvmDeviceFacts', (facts) => kvmObservationOf(facts)),
    Match.tag('VmcomputeFacts', (facts) => vmcomputeObservationOf(facts)),
    Match.tag('AppleHypervisorFacts', (facts) => hypervisorObservationOf(facts)),
    Match.tag('NoProbeForPlatform', ({ arch }) => new PlatformUnsupported({ platform: command.platform, arch })),
    Match.exhaustive,
  )

export const classifyProbeObservation = Workflow.make({
  command: ClassifyProbeObservation,
  decision: ProbeObservation,
  error: Schema.Never,
  decide: (command): Result.Result<ProbeObservation, never> => Result.succeed(observationOf(command)),
})
