import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { ProbeObservation } from './classify-probe-observation.workflow.js'

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

export const VirtualizationVerdict = Schema.Union([VirtualizationEligible, VirtualizationRefused])
export type VirtualizationVerdict = typeof VirtualizationVerdict.Type

export class AssessVirtualization extends Schema.TaggedClass<AssessVirtualization>()('AssessVirtualization', {
  platform: Schema.String,
  observation: ProbeObservation,
}) {
  static readonly [Workflow.InstrumentationBrand] = { platform: 'microsandbox.virtualization.platform' } as const
}
const REMEDIATIONS = {
  kvmDenied:
    'grant /dev/kvm access: add your user to the kvm group, or install the udev rule KERNEL=="kvm", MODE="0666" and reload udev',
  kvmAbsent: 'no /dev/kvm found: enable VT-x/AMD-V virtualization in the host firmware or run on a KVM-capable runner',
  hvf: 'Hypervisor.framework microVMs require Apple Silicon (arm64); Intel Macs are not supported',
  whp: 'Windows Hypervisor Platform is not enabled: run `msb doctor --fix` as administrator to enable it',
  unsupported:
    'unsupported platform: effect-microsandbox supports linux (kvm), macOS (Hypervisor.framework), and windows (WHP)',
} as const

const refused = (topology: string, remediation: string): Result.Result<VirtualizationRefused, never> =>
  Result.succeed(VirtualizationRefused.make({ remediation, topology }))

export const assessVirtualization = Workflow.make({
  command: AssessVirtualization,
  decision: VirtualizationVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<VirtualizationVerdict, never> =>
    Match.value(command.observation).pipe(
      Match.tag('KvmAccessible', () => Result.succeed(VirtualizationEligible.make())),
      Match.tag('KvmDenied', ({ topology }) => refused(topology, REMEDIATIONS.kvmDenied)),
      Match.tag('KvmAbsent', ({ topology }) => refused(topology, REMEDIATIONS.kvmAbsent)),
      Match.tag('HvfUnavailable', ({ arch }) => refused(`arch=${arch}`, REMEDIATIONS.hvf)),
      Match.tag('WHPUnavailable', ({ topology }) => refused(topology, REMEDIATIONS.whp)),
      Match.tag('PlatformUnsupported', ({ platform, arch }) =>
        refused(`platform=${platform} (${arch})`, REMEDIATIONS.unsupported)),
      Match.exhaustive,
    ),
})
