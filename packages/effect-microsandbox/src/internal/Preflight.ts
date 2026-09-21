import { Effect, FileSystem } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { resolveRuntime } from 'microsandbox'
import type { ResolvedRuntime } from 'microsandbox'
import { VirtualizationUnsupportedError } from '../MicroVMError.schema.js'
import {
  AssessVirtualization,
  assessVirtualization,
  HvfUnavailable,
  KvmAbsent,
  KvmAccessible,
  KvmDenied,
  PlatformUnsupported,
  type ProbeObservation,
  WHPUnavailable,
} from './assess-virtualization.workflow.js'

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

const darwinProbe: Effect.Effect<ProbeObservation> = Effect.suspend(() =>
  Effect.succeed<ProbeObservation>(
    process.arch === 'arm64' ? new KvmAccessible() : new HvfUnavailable({ arch: process.arch }),
  )
)

const windowsProbe = (fs: FileSystem.FileSystem): Effect.Effect<ProbeObservation> =>
  Effect.map(
    fs.exists(WINDOWS_VMCOMPUTE).pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
    (present): ProbeObservation =>
      present
        ? new KvmAccessible()
        : new WHPUnavailable({ topology: 'vmcompute present=false' }),
  )

const unsupportedProbe: Effect.Effect<ProbeObservation> = Effect.suspend(() =>
  Effect.succeed(new PlatformUnsupported({ platform: process.platform, arch: process.arch }))
)

const probes: Record<string, ((fs: FileSystem.FileSystem) => Effect.Effect<ProbeObservation>) | undefined> = {
  linux: linuxProbe,
  darwin: () => darwinProbe,
  win32: windowsProbe,
}

const probeFor = (fs: FileSystem.FileSystem, platform: string): Effect.Effect<ProbeObservation> =>
  probes[platform] !== undefined ? probes[platform](fs) : unsupportedProbe

const probeCapability = (fs: FileSystem.FileSystem): Effect.Effect<ProbeObservation> =>
  Effect.suspend(() => probeFor(fs, process.platform))

let announcedRuntime = false

const announce = (resolved: ResolvedRuntime): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (announcedRuntime) return Effect.void
    announcedRuntime = true
    return Effect.logInfo(
      `[effect-microsandbox] microsandbox runtime resolved: ${resolved.msbPath} (origin: ${resolved.origin})`,
    )
  })

/**
 * Fail fast with actionable diagnostics when hardware virtualization is
 * unavailable (R8), then resolve the msb runtime through the SDK (R7):
 * bundled platform binaries are the default and MSB_PATH / MSB_LIBKRUNFW_PATH
 * / MSB_HOME operator overrides pass through untouched — a resolution failure
 * surfaces as the SDK's own defect, never a silent fallback. The probe reads
 * the host, the verdict cell decides, and this shell only translates the
 * verdict: a refusal logs its topology and fails with the cell's remediation.
 * The first successful pre-flight per process logs the resolved runtime path.
 *
 * @internal
 */
export const preflightWith = (
  fs: FileSystem.FileSystem,
): Effect.Effect<ResolvedRuntime, VirtualizationUnsupportedError> =>
  Effect.gen(function*() {
    const observation = yield* probeCapability(fs)
    const command = new AssessVirtualization({ platform: process.platform, observation })
    const verdict = Result.getOrThrow(assessVirtualization(command))
    return yield* Match.value(verdict).pipe(
      Match.tag('VirtualizationRefused', (refused) =>
        Effect.andThen(
          Effect.logDebug(`[effect-microsandbox] virtualization topology: ${refused.topology}`),
          Effect.fail(
            new VirtualizationUnsupportedError({ platform: command.platform, remediation: refused.remediation }),
          ),
        )),
      Match.tag('VirtualizationEligible', () =>
        Effect.flatMap(Effect.sync(() => resolveRuntime()), (resolved) => Effect.as(announce(resolved), resolved))),
      Match.exhaustive,
    )
  })
