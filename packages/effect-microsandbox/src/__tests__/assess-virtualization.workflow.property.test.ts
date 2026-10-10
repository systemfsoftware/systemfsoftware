import { it } from '@systemfsoftware/vitest'
import { ConfigProvider, Effect, FileSystem, Layer, PlatformError, Result, Schema, Tracer } from 'effect'
import * as Match from 'effect/Match'
import { AssessVirtualization, assessVirtualization } from '../assess-virtualization.workflow.js'
import { ServiceSpec } from '../MicroVMSpec.schema.js'
import { probeVirtualization } from '../probe-virtualization.cell.js'

it.prop(
  '∀cmd_Verdict_=Sound',
  { of: [AssessVirtualization], subject: assessVirtualization },
  (subject, [command]) =>
    Result.match(subject(command), {
      onFailure: () => false,
      onSuccess: (verdict) =>
        Match.value(command.observation).pipe(
          Match.tag('KvmAccessible', () =>
            Match.value(verdict).pipe(
              Match.tag('VirtualizationEligible', () => true),
              Match.tag('VirtualizationRefused', () => false),
              Match.exhaustive,
            )),
          Match.orElse((refusalObs) =>
            Match.value(verdict).pipe(
              Match.tag('VirtualizationEligible', () => false),
              Match.tag('VirtualizationRefused', ({ remediation, topology }) => {
                const expectedTopology = Match.value(refusalObs).pipe(
                  Match.tag('KvmDenied', (o) => o.topology),
                  Match.tag('KvmAbsent', (o) => o.topology),
                  Match.tag('WHPUnavailable', (o) => o.topology),
                  Match.tag('HvfUnavailable', (o) => `arch=${o.arch}`),
                  Match.tag('PlatformUnsupported', (o) => `platform=${o.platform} (${o.arch})`),
                  Match.exhaustive,
                )
                return remediation.length > 0 && topology === expectedTopology
              }),
              Match.exhaustive,
            )
          ),
        ),
    }),
)

const captureCellSpans = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<ReadonlyArray<Tracer.Span>, E, R> =>
  Effect.gen(function*() {
    const spans: Array<Tracer.Span> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      },
    })
    yield* Effect.provideService(program, Tracer.Tracer, tracer)
    return spans
  })

const stringAttributeOf = (spans: ReadonlyArray<Tracer.Span>, name: string, attribute: string): string | undefined => {
  const value = spans.find((span) => span.name === name)?.attributes.get(attribute)
  return typeof value === 'string' ? value : undefined
}

// Departs from compound-packs/boundary-testing/real-system-oracles.md ("Real System Oracles, Never Fakes"): a real filesystem oracle reads the host's own tree, which cannot express '/dev/kvm absent' on a machine that exposes the device.
const absentKvmFileSystem = FileSystem.layerNoop({
  access: () =>
    Effect.fail(
      PlatformError.systemError({
        _tag: 'NotFound',
        module: 'FileSystem',
        method: 'access',
        pathOrDescriptor: '/dev/kvm',
      }),
    ),
  exists: () => Effect.succeed(false),
})

const hostLayerOf = (platform: string) =>
  Layer.merge(
    absentKvmFileSystem,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PLATFORM: platform, ARCH: 'arm64' } })),
  )

const serviceSpec = ServiceSpec.make({ image: 'alpine:3.20', env: {}, mounts: [], ports: [] })

const probeVirtualizationSpans = (platform: string) =>
  captureCellSpans(Effect.provide(probeVirtualization.run(serviceSpec), hostLayerOf(platform)))

it.effect.prop(
  '∀host_ProbeVirtualizationSpan_≡Platform',
  { of: [Schema.Literals(['linux', 'win32', 'freebsd'])], subject: probeVirtualizationSpans },
  (subject, [platform]) =>
    Effect.map(
      subject(platform),
      (spans) => stringAttributeOf(spans, 'probe_virtualization', 'microsandbox.virtualization.platform') === platform,
    ),
)
