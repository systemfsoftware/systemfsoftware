import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Config, Effect, FileSystem, Option } from 'effect'
import { AssessVirtualization, assessVirtualization } from './assess-virtualization.workflow.js'
import {
  AppleHypervisorFacts,
  ClassifyProbeObservation,
  classifyProbeObservation,
  KvmDeviceFacts,
  NoProbeForPlatform,
  type ProbeFacts,
  VmcomputeFacts,
} from './classify-probe-observation.workflow.js'
import { VirtualizationUnsupportedError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { RuntimeResolver } from './RuntimeResolver.js'

const KVM_DEVICE = '/dev/kvm'
const WINDOWS_VMCOMPUTE = 'C:\\Windows\\System32\\vmcompute.dll'

const kvmFacts: Effect.Effect<KvmDeviceFacts, never, FileSystem.FileSystem> = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const accessible = yield* fs.access(KVM_DEVICE, { readable: true, writable: true }).pipe(
    Effect.as(true),
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  const present = yield* fs.exists(KVM_DEVICE).pipe(
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  return new KvmDeviceFacts({ accessible, present })
})

const vmcomputeFacts: Effect.Effect<VmcomputeFacts, never, FileSystem.FileSystem> = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const present = yield* fs.exists(WINDOWS_VMCOMPUTE).pipe(
    Effect.catchTag('PlatformError', () => Effect.succeed(false)),
  )
  return new VmcomputeFacts({ present })
})

const appleFacts: Effect.Effect<AppleHypervisorFacts, never, FileSystem.FileSystem> = Effect.gen(function*() {
  const arch = yield* Config.String('ARCH').pipe(Config.withDefault(process.arch))
  return new AppleHypervisorFacts({ arch })
}).pipe(Effect.orDie)

const factsByPlatform: Record<string, Effect.Effect<ProbeFacts, never, FileSystem.FileSystem>> = {
  linux: kvmFacts,
  darwin: appleFacts,
  win32: vmcomputeFacts,
}

const probeCapability = Effect.gen(function*() {
  const platform = yield* Config.String('PLATFORM').pipe(Config.withDefault(process.platform))
  const arch = yield* Config.String('ARCH').pipe(Config.withDefault(process.arch))
  const facts = yield* Option.match(Option.fromNullishOr(factsByPlatform[platform]), {
    onSome: (facts) => facts,
    onNone: () => Effect.succeed<ProbeFacts>(new NoProbeForPlatform({ arch })),
  })
  const observation = yield* Effect.fromResult(
    classifyProbeObservation(new ClassifyProbeObservation({ platform, facts })),
  )
  return { platform, observation }
}).pipe(Effect.orDie)

const runtimeLoad = (platform: string) => Effect.flatMap(RuntimeResolver, (resolver) => resolver.resolve(platform))

export const probeVirtualization = Sandwich.named('probe_virtualization')((_spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const capability = yield* probeCapability
    return new AssessVirtualization(capability)
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
