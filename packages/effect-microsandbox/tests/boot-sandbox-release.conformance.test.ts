import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { ConfigProvider, Crypto, Effect, Layer, Schema } from 'effect'
import { nothingLeftHeld, recordingSandboxRuntime, SandboxLedger } from './__fixtures__/sandbox-runtime.fixture.js'

const Feature = makeFeature({ it })

const twoPortService = MicroVM.spec('alpine:3.20').withExposedPorts([8080, 6379])

const bootAgainstFakes = Layer.mergeAll(
  Layer.succeed(
    Crypto.Crypto,
    Crypto.make({
      randomBytes: (size) => new Uint8Array(size),
      digest: () => Effect.succeed(new Uint8Array()),
    }),
  ),
  Layer.succeed(Readiness.HostProber, {
    dial: () => Effect.succeed({ _tag: 'Connected' as const }),
    exchange: () => Effect.succeed({ _tag: 'Refused' as const }),
  }),
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PLATFORM: 'darwin', ARCH: 'arm64' } })),
  nodeFileSystemLayer,
  recordingSandboxRuntime,
)

Feature('Booting a microVM leaves nothing behind when the boot is stopped', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A sandbox boot stopped at any step destroys the sandbox it started and frees its host port',
      Gherkin.Do.pipe(
        Given('a sandbox runtime that records every sandbox it creates and destroys')(
          'environment',
          () => Layer.build(bootAgainstFakes),
        ),
        When('a service exposing two ports boots and is stopped at each step of the boot')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(twoPortService.scoped, s.environment), {
              probe: Effect.provide(nothingLeftHeld, s.environment),
            }),
        ),
        Then('no started sandbox is left undestroyed, and the boot started at least one')((state, expect) =>
          Effect.map(
            Effect.flatMap(SandboxLedger, (ledger) => ledger.created),
            (created) =>
              expect({ report: state.checked, created }, Conformance.render(state.checked)).toMatchObject({
                report: { _tag: 'Pass' },
                created: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
              }),
          ).pipe(Effect.provide(state.environment))
        ),
      ),
    )
  })
