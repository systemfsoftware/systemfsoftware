import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-microsandbox/VirtualizationVerdict')
type VerdictTypeId = typeof VerdictTypeId

export class VirtualizationEligible extends Schema.TaggedClass<VirtualizationEligible>()(
  'VirtualizationEligible',
  {},
) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class VirtualizationRefused extends Schema.TaggedClass<VirtualizationRefused>()(
  'VirtualizationRefused',
  {
    remediation: Schema.String,
    topology: Schema.String,
  },
) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export type VirtualizationVerdict = VirtualizationEligible | VirtualizationRefused

export class KvmAccessible extends Schema.TaggedClass<KvmAccessible>()('KvmAccessible', {}) {}

export class KvmDenied extends Schema.TaggedClass<KvmDenied>()('KvmDenied', {
  topology: Schema.String,
}) {}

export class KvmAbsent extends Schema.TaggedClass<KvmAbsent>()('KvmAbsent', {
  topology: Schema.String,
}) {}

export class HvfUnavailable extends Schema.TaggedClass<HvfUnavailable>()('HvfUnavailable', {
  arch: Schema.String,
}) {}

export class WHPUnavailable extends Schema.TaggedClass<WHPUnavailable>()('WHPUnavailable', {
  topology: Schema.String,
}) {}

export class PlatformUnsupported extends Schema.TaggedClass<PlatformUnsupported>()('PlatformUnsupported', {
  platform: Schema.String,
  arch: Schema.String,
}) {}

export const ProbeObservation = Schema.Union([
  KvmAccessible,
  KvmDenied,
  KvmAbsent,
  HvfUnavailable,
  WHPUnavailable,
  PlatformUnsupported,
])
export type ProbeObservation = typeof ProbeObservation.Type

export class AssessVirtualization extends Schema.TaggedClass<AssessVirtualization>()('AssessVirtualization', {
  platform: Schema.String,
  observation: ProbeObservation,
}) {}

const KVM_DENIED_REMEDIATION =
  'grant /dev/kvm access: add your user to the kvm group, or install the udev rule KERNEL=="kvm", MODE="0666" and reload udev'
const KVM_ABSENT_REMEDIATION =
  'no /dev/kvm found: enable VT-x/AMD-V virtualization in the host firmware or run on a KVM-capable runner'
const HVF_REMEDIATION = 'Hypervisor.framework microVMs require Apple Silicon (arm64); Intel Macs are not supported'
const WHP_REMEDIATION =
  'Windows Hypervisor Platform is not enabled: run `msb doctor --fix` as administrator to enable it'
const UNSUPPORTED_REMEDIATION =
  'unsupported platform: effect-microsandbox supports linux (kvm), macOS (Hypervisor.framework), and windows (WHP)'

export const assessVirtualization = Workflow.total(
  AssessVirtualization,
  (command): Result.Result<VirtualizationVerdict, never> =>
    Match.value(command.observation).pipe(
      Match.tag('KvmAccessible', () => Result.succeed(VirtualizationEligible.make())),
      Match.tag('KvmDenied', ({ topology }) =>
        Result.succeed(VirtualizationRefused.make({ remediation: KVM_DENIED_REMEDIATION, topology }))),
      Match.tag('KvmAbsent', ({ topology }) =>
        Result.succeed(VirtualizationRefused.make({ remediation: KVM_ABSENT_REMEDIATION, topology }))),
      Match.tag('HvfUnavailable', ({ arch }) =>
        Result.succeed(VirtualizationRefused.make({ remediation: HVF_REMEDIATION, topology: `arch=${arch}` }))),
      Match.tag('WHPUnavailable', ({ topology }) =>
        Result.succeed(VirtualizationRefused.make({ remediation: WHP_REMEDIATION, topology }))),
      Match.tag('PlatformUnsupported', ({ platform, arch }) =>
        Result.succeed(
          VirtualizationRefused.make({
            remediation: UNSUPPORTED_REMEDIATION,
            topology: `platform=${platform} (${arch})`,
          }),
        )),
      Match.exhaustive,
    ),
)
