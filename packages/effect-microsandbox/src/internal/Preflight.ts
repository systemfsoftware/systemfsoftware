/// <reference types="vitest/importMeta" />
import { Effect, FileSystem } from 'effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { resolveRuntime } from 'microsandbox'
import type { ResolvedRuntime } from 'microsandbox'
import { VirtualizationUnsupportedError } from '../MicroVMError.schema.js'

type ProbeFailure =
  | 'kvm-missing'
  | 'kvm-permission'
  | 'no-hypervisor-arch'
  | 'whp-missing'
  | 'unsupported-platform'

interface Probe {
  readonly platform: string
  readonly virtualizationReady: boolean
  readonly failure: ProbeFailure
  readonly topology: string
}

interface Refusal {
  readonly remediation: string
  readonly topology: string
}

const REMEDIATIONS: Record<ProbeFailure, string> = {
  'kvm-missing':
    'no /dev/kvm found: enable VT-x/AMD-V virtualization in the host firmware or run on a KVM-capable runner',
  'kvm-permission':
    'grant /dev/kvm access: add your user to the kvm group, or install the udev rule KERNEL=="kvm", MODE="0666" and reload udev',
  'no-hypervisor-arch': 'Hypervisor.framework microVMs require Apple Silicon (arm64); Intel Macs are not supported',
  'whp-missing': 'Windows Hypervisor Platform is not enabled: run `msb doctor --fix` as administrator to enable it',
  'unsupported-platform':
    'unsupported platform: effect-microsandbox supports linux (kvm), macOS (Hypervisor.framework), and windows (WHP)',
}

const KVM_DEVICE = '/dev/kvm'
const WINDOWS_VMCOMPUTE = 'C:\\Windows\\System32\\vmcompute.dll'

const ready = (): Probe => ({
  platform: `${process.platform} (${process.arch})`,
  virtualizationReady: true,
  failure: 'kvm-missing',
  topology: '',
})

const failed = (failure: ProbeFailure, topology: string): Probe => ({
  platform: `${process.platform} (${process.arch})`,
  virtualizationReady: false,
  failure,
  topology,
})

const linuxProbe: (fs: FileSystem.FileSystem) => Effect.Effect<Probe> = (fs) =>
  Effect.flatMap(
    fs.access(KVM_DEVICE, { readable: true, writable: true }).pipe(
      Effect.as(true),
      Effect.catchTag('PlatformError', () => Effect.succeed(false)),
    ),
    (accessible) =>
      accessible
        ? Effect.succeed(ready())
        : Effect.map(
          fs.exists(KVM_DEVICE).pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
          (present) =>
            present ? failed('kvm-permission', 'kvm exists=true rw=false') : failed('kvm-missing', 'kvm exists=false'),
        ),
  )

const darwinProbe: Probe = process.arch === 'arm64'
  ? ready()
  : failed('no-hypervisor-arch', `arch=${process.arch}`)

const windowsProbe: (fs: FileSystem.FileSystem) => Effect.Effect<Probe> = (fs) =>
  Effect.map(
    fs.exists(WINDOWS_VMCOMPUTE).pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
    (present) => (present ? ready() : failed('whp-missing', 'vmcompute present=false')),
  )

const unsupportedProbe: Probe = failed(
  'unsupported-platform',
  `platform=${process.platform} (${process.arch})`,
)

const probes: Record<string, ((fs: FileSystem.FileSystem) => Effect.Effect<Probe>) | undefined> = {
  linux: linuxProbe,
  darwin: () => Effect.succeed(darwinProbe),
  win32: windowsProbe,
}

const probeFor = (fs: FileSystem.FileSystem, platform: string): Effect.Effect<Probe> => {
  const probe = probes[platform]
  return probe === undefined ? Effect.succeed(unsupportedProbe) : probe(fs)
}

const probeCapability = (fs: FileSystem.FileSystem): Effect.Effect<Probe> =>
  Effect.suspend(() => probeFor(fs, process.platform))

const verdictFor = (probe: Probe): Result.Result<void, Refusal> =>
  probe.virtualizationReady
    ? Result.succeed(undefined)
    : Result.fail({ remediation: REMEDIATIONS[probe.failure], topology: probe.topology })

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
 * surfaces as the SDK's own defect, never a silent fallback. The first
 * successful pre-flight per process logs the resolved runtime path.
 *
 * @internal
 */
export const preflightWith = (
  fs: FileSystem.FileSystem,
): Effect.Effect<ResolvedRuntime, VirtualizationUnsupportedError> =>
  Effect.gen(function*() {
    const probe = yield* probeCapability(fs)
    const refusal = Result.getFailure(verdictFor(probe))
    if (Option.isSome(refusal)) {
      yield* Effect.logDebug(`[effect-microsandbox] virtualization topology: ${refusal.value.topology}`)
      return yield* new VirtualizationUnsupportedError({
        platform: probe.platform,
        remediation: refusal.value.remediation,
      })
    }
    const resolved = yield* Effect.sync(() => resolveRuntime())
    yield* announce(resolved)
    return resolved
  })

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')

  const probeWith = (failure: ProbeFailure): Probe => ({
    platform: 'test',
    virtualizationReady: false,
    failure,
    topology: 'test',
  })
  const isReady = (probe: Probe): boolean => Result.isSuccess(verdictFor(probe))
  const isRefused = (probe: Probe): boolean => Result.isFailure(verdictFor(probe))
  const remediationOf = (failure: ProbeFailure): string => REMEDIATIONS[failure]

  it.prop('→KvmRw_Verdict_=Ok', [], () => isReady(ready()))
  it.prop(
    '→KvmNoRw_Verdict_=Udev',
    [],
    () => isRefused(probeWith('kvm-permission')) && remediationOf('kvm-permission').includes('udev'),
  )
  it.prop('→KvmAbsent_Verdict_=Firmware', [], () => remediationOf('kvm-missing').includes('firmware'))
  it.prop('→Arm64_Verdict_=Matches', [], () => isReady(darwinProbe) === (process.arch === 'arm64'))
  it.prop(
    '→Intel_Verdict_=Refused',
    [],
    () => isRefused(probeWith('no-hypervisor-arch')) && remediationOf('no-hypervisor-arch').includes('Apple Silicon'),
  )
  it.prop('→WhpOn_Verdict_=Ok', [], () => isReady({ ...probeWith('whp-missing'), virtualizationReady: true }))
  it.prop('→WhpOff_Verdict_=Doctor', [], () => remediationOf('whp-missing').includes('msb doctor --fix'))
  it.prop('→Unknown_Verdict_=Platform', [], () => remediationOf('unsupported-platform').includes('windows (WHP)'))
}
