import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { ConfigProvider, Crypto, Effect, Layer, Match, Metric } from 'effect'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import { recordingSandboxRuntime, SandboxLedger } from './__fixtures__/sandbox-runtime.fixture.js'

const Feature = makeFeature({ it })

const UNSUPPORTED_PLATFORM = 'freebsd'

const twoPortService = MicroVM.spec('alpine:3.20').withExposedPorts([8080, 6379])

const sharedCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: () => Effect.succeed(new Uint8Array()),
  }),
)

const hostProber = Layer.succeed(Readiness.HostProber, {
  dial: () => Effect.succeed({ _tag: 'Connected' as const }),
  exchange: () => Effect.succeed({ _tag: 'Refused' as const }),
})

const freshMetrics = Layer.sync(Metric.MetricRegistry, (): Metric.MetricRegistry => new Map())

const hostOf = (platform: string) =>
  Layer.mergeAll(
    sharedCrypto,
    hostProber,
    freshMetrics,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PLATFORM: platform, ARCH: 'arm64' } })),
    nodeFileSystemLayer,
    recordingSandboxRuntime,
  )

const startRecordOf = <A, R>(start: Effect.Effect<A, MicroVM.MicroVMError, R | Scope.Scope>) =>
  Effect.gen(function*() {
    const answered = yield* Effect.result(Effect.scoped(start))
    const ledger = yield* SandboxLedger
    const snapshots = yield* Metric.snapshot
    return {
      answered,
      acquired: yield* ledger.created,
      heldPorts: yield* ledger.heldPorts,
      probeClasses: snapshots
        .filter(
          (snapshot) => snapshot.type === 'Histogram' && snapshot.id.includes('app.probe_virtualization.duration'),
        )
        .map((snapshot) => snapshot.attributes?.['result_class']),
    }
  })

Feature('Starting a microVM only where the host can virtualize')
  .withScenarioLayer(hostOf(UNSUPPORTED_PLATFORM))
  .body(({ scenario }) => {
    scenario(
      'A start on a platform the probe refuses is refused with the platform it read, and no sandbox is started',
      Gherkin.Do.pipe(
        Given('a host whose platform no virtualization probe supports')(
          'platform',
          () => Effect.succeed(UNSUPPORTED_PLATFORM),
        ),
        When('a service exposing two ports is started on that host')(
          'start',
          () => startRecordOf(twoPortService.scoped),
        ),
        Then('the refusal names that platform, starts no sandbox, and records a refusal')((s, expect) =>
          expect({
            refusal: Result.match(s.start.answered, {
              onSuccess: () => null,
              onFailure: (error) =>
                Match.value(error).pipe(
                  Match.tag('VirtualizationUnsupportedError', (value) => ({ platform: value.platform })),
                  Match.orElse(() => null),
                ),
            }),
            acquired: s.start.acquired,
            heldPorts: s.start.heldPorts,
            recordedSuccess: s.start.probeClasses.includes('success'),
            recordedInfrastructure: s.start.probeClasses.includes('infrastructure'),
          }).toEqual({
            refusal: { platform: s.platform },
            acquired: 0,
            heldPorts: [],
            recordedSuccess: true,
            recordedInfrastructure: false,
          })
        ),
      ),
    )
  })
