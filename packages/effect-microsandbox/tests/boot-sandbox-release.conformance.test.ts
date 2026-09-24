import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { ConfigProvider, Crypto, Effect, Layer, Match } from 'effect'
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

const passRuns = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new Error(
        `expected every stopped boot to tear down what it created, but the check read: ${Conformance.render(report)}`,
      )
    }),
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
        Then('no started sandbox is left undestroyed and no host port stays taken')((s) => {
          passRuns(s.checked)
        }),
        And('the boot started at least one sandbox, so the release proves something')((s) =>
          Effect.gen(function*() {
            const ledger = yield* SandboxLedger
            const created = yield* ledger.created
            if (created === 0) {
              throw new Error('the boot started no sandbox, so the release proves nothing')
            }
          }).pipe(Effect.provide(s.environment))
        ),
      ),
    )
  })
