import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, FileSystem } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { resolveRuntime } from 'microsandbox'
import type { ResolvedRuntime } from 'microsandbox'
import {
  AssessVirtualization,
  assessVirtualization,
  HvfUnavailable,
  KvmAbsent,
  KvmAccessible,
  KvmDenied,
  PlatformUnsupported,
  type ProbeObservation,
  type VirtualizationVerdict,
  WHPUnavailable,
} from './assess-virtualization.workflow.js'
import { VirtualizationUnsupportedError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'

const KVM_DEVICE = '/dev/kvm'
const WINDOWS_VMCOMPUTE = 'C:\\Windows\\System32\\vmcompute.dll'

const kvmObservationOf = (accessible: boolean, present: boolean): ProbeObservation =>
  Match.value({ accessible, present }).pipe(
    Match.when({ accessible: true }, () => new KvmAccessible()),
    Match.when({ present: true }, () => new KvmDenied({ topology: 'kvm exists=true rw=false' })),
    Match.orElse(() => new KvmAbsent({ topology: 'kvm exists=false' })),
  )

const linuxProbe = (fs: FileSystem.FileSystem): Effect.Effect<ProbeObservation> =>
  Effect.flatMap(
    fs.access(KVM_DEVICE, { readable: true, writable: true }).pipe(
      Effect.as(true),
      Effect.catchTag('PlatformError', () => Effect.succeed(false)),
    ),
    (accessible) =>
      accessible
        ? Effect.succeed<ProbeObservation>(kvmObservationOf(true, false))
        : Effect.map(
          fs.exists(KVM_DEVICE).pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
          (present) => kvmObservationOf(false, present),
        ),
  )

const darwinProbe: Effect.Effect<ProbeObservation> = Effect.succeed<ProbeObservation>(
  process.arch === 'arm64' ? new KvmAccessible() : new HvfUnavailable({ arch: process.arch }),
)

const windowsProbe = (fs: FileSystem.FileSystem): Effect.Effect<ProbeObservation> =>
  Effect.map(
    fs.exists(WINDOWS_VMCOMPUTE).pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
    (present): ProbeObservation =>
      present
        ? new KvmAccessible()
        : new WHPUnavailable({ topology: 'vmcompute present=false' }),
  )

const unsupportedProbe: Effect.Effect<ProbeObservation> = Effect.succeed<ProbeObservation>(
  new PlatformUnsupported({ platform: process.platform, arch: process.arch }),
)

const probes: Record<string, ((fs: FileSystem.FileSystem) => Effect.Effect<ProbeObservation>) | undefined> = {
  linux: linuxProbe,
  darwin: () => darwinProbe,
  win32: windowsProbe,
}

const probeFor = (fs: FileSystem.FileSystem, platform: string): Effect.Effect<ProbeObservation> =>
  probes[platform] !== undefined ? probes[platform](fs) : unsupportedProbe

const probeCapability: Effect.Effect<ProbeObservation, never, FileSystem.FileSystem> = Effect.flatMap(
  FileSystem.FileSystem,
  (fs) => probeFor(fs, process.platform),
)
const announce = (resolved: ResolvedRuntime): Effect.Effect<void> =>
  Effect.logInfo(
    `[effect-microsandbox] microsandbox runtime resolved: ${resolved.msbPath} (origin: ${resolved.origin})`,
  )

const writeProbe = (
  verdict: Result.Result<VirtualizationVerdict, never>,
  command: AssessVirtualization,
): Effect.Effect<void, VirtualizationUnsupportedError> =>
  Match.value(Result.getOrThrow(verdict)).pipe(
    Match.tag('VirtualizationRefused', (refused) =>
      Effect.andThen(
        Effect.logDebug(`[effect-microsandbox] virtualization topology: ${refused.topology}`),
        Effect.fail(
          new VirtualizationUnsupportedError({ platform: command.platform, remediation: refused.remediation }),
        ),
      )),
    Match.tag('VirtualizationEligible', () => Effect.flatMap(Effect.sync(() => resolveRuntime()), announce)),
    Match.exhaustive,
  )

export const probeVirtualization = Sandwich.named('probe_virtualization')((_spec: MicroVMSpec) =>
  Effect.map(
    probeCapability,
    (observation) => new AssessVirtualization({ platform: process.platform, observation }),
  )
)
  .decide(assessVirtualization)
  .write(writeProbe)
