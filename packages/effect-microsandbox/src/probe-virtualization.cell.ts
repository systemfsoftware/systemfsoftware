import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Config, Effect, FileSystem, Option } from 'effect'
import * as Match from 'effect/Match'
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
import { VirtualizationUnsupportedError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { RuntimeResolver } from './RuntimeResolver.js'

const KVM_DEVICE = '/dev/kvm'
const WINDOWS_VMCOMPUTE = 'C:\\Windows\\System32\\vmcompute.dll'

const kvmObservationOf = (accessible: boolean, present: boolean): ProbeObservation =>
  Match.value({ accessible, present }).pipe(
    Match.when({ accessible: true }, () => KvmAccessible.make({})),
    Match.when({ present: true }, () => KvmDenied.make({ topology: 'kvm exists=true rw=false' })),
    Match.orElse(() => KvmAbsent.make({ topology: 'kvm exists=false' })),
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
    Match.when('arm64', () => KvmAccessible.make({})),
    Match.orElse((a) => HvfUnavailable.make({ arch: a })),
  )
}).pipe(Effect.orDie)

const windowsProbe = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const present = yield* fs.exists(WINDOWS_VMCOMPUTE).pipe(
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  if (present) {
    return KvmAccessible.make({})
  }
  return WHPUnavailable.make({ topology: 'vmcompute present=false' })
})

const unsupportedProbe = (platform: string, arch: string) =>
  Effect.succeed<ProbeObservation>(PlatformUnsupported.make({ platform, arch }))

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

const runtimeLoad = (platform: string) => Effect.flatMap(RuntimeResolver, (resolver) => resolver.resolve(platform))

export const probeVirtualization = Sandwich.named('probe_virtualization')((_spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const platform = yield* Config.String('PLATFORM').pipe(Config.withDefault(process.platform))
    const observation = yield* probeCapability
    return new AssessVirtualization({ platform, observation })
  }).pipe(Effect.orDie)
)
  .decide(assessVirtualization)
  .write({
    VirtualizationEligible: (_eligible, command) => runtimeLoad(command.platform),
    VirtualizationRefused: (refused, command) =>
      Effect.andThen(
        Effect.logDebug('virtualization topology refused', { 'virtualization.topology': refused.topology }),
        Effect.succeed(
          new VirtualizationUnsupportedError({ platform: command.platform, remediation: refused.remediation }),
        ),
      ),
    CommandRejected: (rejected, command) =>
      Effect.fail(
        new VirtualizationUnsupportedError({
          platform: command.platform,
          remediation: 'The virtualization command could not be understood',
          cause: rejected,
        }),
      ),
  })
