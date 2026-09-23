import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Config, Effect, FileSystem, Option } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
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

const linuxProbe = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const accessible = yield* fs.access(KVM_DEVICE, { readable: true, writable: true }).pipe(
    Effect.as(true),
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  if (accessible) {
    return kvmObservationOf(true, false)
  }
  const present = yield* fs.exists(KVM_DEVICE).pipe(
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  return kvmObservationOf(false, present)
})
const darwinProbe = Effect.gen(function*() {
  const arch = yield* Config.String('ARCH').pipe(Config.withDefault(process.arch))
  return Match.value(arch).pipe(
    Match.when('arm64', () => new KvmAccessible()),
    Match.orElse((a) => new HvfUnavailable({ arch: a })),
  )
}).pipe(Effect.orDie)

const windowsProbe = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const present = yield* fs.exists(WINDOWS_VMCOMPUTE).pipe(
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  if (present) {
    return new KvmAccessible()
  }
  return new WHPUnavailable({ topology: 'vmcompute present=false' })
})

const unsupportedProbe = (platform: string, arch: string) =>
  Effect.succeed<ProbeObservation>(new PlatformUnsupported({ platform, arch }))

const probes: Record<string, Effect.Effect<ProbeObservation, never, FileSystem.FileSystem>> = {
  linux: linuxProbe,
  darwin: darwinProbe,
  win32: windowsProbe,
}

const probeCapability = Effect.gen(function*() {
  const platform = yield* Config.String('PLATFORM').pipe(Config.withDefault(process.platform))
  const arch = yield* Config.String('ARCH').pipe(Config.withDefault(process.arch))
  return yield* Option.match(Option.fromNullishOr(probes[platform]), {
    onSome: (probe) => probe,
    onNone: () => unsupportedProbe(platform, arch),
  })
}).pipe(Effect.orDie)
const announce = (resolved: ResolvedRuntime) =>
  Effect.logInfo(
    `[effect-microsandbox] microsandbox runtime resolved: ${resolved.msbPath} (origin: ${resolved.origin})`,
  )

const writeProbe = (
  verdict: Result.Result<VirtualizationVerdict, never>,
  command: AssessVirtualization,
): Effect.Effect<void, VirtualizationUnsupportedError> =>
  verdict.pipe(
    Result.getOrThrow,
    Match.value,
    Match.tag('VirtualizationRefused', (refused) =>
      Effect.andThen(
        Effect.logDebug(`[effect-microsandbox] virtualization topology: ${refused.topology}`),
        Effect.fail(
          new VirtualizationUnsupportedError({ platform: command.platform, remediation: refused.remediation }),
        ),
      )),
    Match.tag('VirtualizationEligible', () =>
      Effect.tryPromise({
        try: () => import('microsandbox'),
        catch: (cause) =>
          new VirtualizationUnsupportedError({
            platform: command.platform,
            remediation: 'Failed to load microsandbox native runtime',
            cause,
          }),
      }).pipe(
        Effect.flatMap(({ resolveRuntime }) => Effect.sync(() => resolveRuntime())),
        Effect.flatMap(announce),
      )),
    Match.exhaustive,
  )

export const probeVirtualization = Sandwich.named('probe_virtualization')((_spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const platform = yield* Config.String('PLATFORM').pipe(Config.withDefault(process.platform))
    const observation = yield* probeCapability
    return new AssessVirtualization({ platform, observation })
  }).pipe(Effect.orDie)
)
  .decide(assessVirtualization)
  .write(writeProbe)
