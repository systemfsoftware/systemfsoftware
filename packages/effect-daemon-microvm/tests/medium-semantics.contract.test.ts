import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer } from 'effect'
import { Sandbox } from 'microsandbox'
import { ABNORMAL_EXIT_CODE, childScriptWorkload } from './__fixtures__/child-script.js'
import { featureNameOf, kvmGate } from './__fixtures__/kvm-gate.js'

const Feature = makeFeature({ it })

const SANDBOX_NAME_PREFIX = 'effect-microsandbox-'

const MicroVMLayer = Layer.mergeAll(
  MicroVMMedium.layer(),
  nodeServicesLayer,
  Readiness.NodeHostProber.layer,
)

const launchedChildOf = MicroVMMedium.conformanceDriver(childScriptWorkload).launch('workload', [])

const mediumOf = Effect.map(MicroVMMedium.port, (shape) => shape.medium)

const terminationAfter = (step: Conformance.ChildStep) =>
  Effect.scoped(Effect.gen(function*() {
    const launched = yield* launchedChildOf
    const medium = yield* mediumOf
    const evidence = yield* medium.start(launched.program)
    yield* launched.control.advance(step, 0)
    return yield* medium.report(evidence)
  }))

const readinessAndProbe = Effect.scoped(Effect.gen(function*() {
  const launched = yield* launchedChildOf
  const medium = yield* mediumOf
  const evidence = yield* medium.start(launched.program)
  yield* launched.control.advance({ _tag: 'BecomeReady' }, 0)
  yield* evidence.ready
  return yield* medium.probe(evidence)
}))

const sandboxNamesOf = (cursor: string | undefined): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function*() {
    const page = yield* Effect.promise(() =>
      cursor === undefined
        ? Sandbox.list()
        : Sandbox.listWith((list) => list.cursor(cursor))
    )
    const own = page.sandboxes.map((sandbox) => sandbox.name)
    const rest = yield* Effect.suspend(() =>
      page.nextCursor === undefined
        ? Effect.succeed<ReadonlyArray<string>>([])
        : sandboxNamesOf(page.nextCursor)
    )
    return [...own, ...rest]
  })

const sandboxesLeftByAnIncarnation = Effect.gen(function*() {
  yield* Effect.scoped(Effect.gen(function*() {
    const launched = yield* launchedChildOf
    const medium = yield* mediumOf
    yield* medium.start(launched.program)
  }))
  const names = yield* sandboxNamesOf(undefined)
  return names.filter((name) => name.startsWith(SANDBOX_NAME_PREFIX))
})

Feature(
  featureNameOf('A workload in a microVM tells its supervisor how it ended, and the machine it ran in goes away'),
  kvmGate.available ? undefined : { skip: true },
)
  .live('each scenario boots, reports and tears down a real microsandbox virtual machine on the host')
  .withLayer(MicroVMLayer)
  .body(({ scenario }) => {
    scenario(
      'A workload that exits cleanly is reported as a normal termination',
      Gherkin.Do.pipe(
        Given('a workload scripted to exit cleanly when it is told to')(
          'termination',
          () => terminationAfter({ _tag: 'ExitNormal' }),
        ),
        Then('the medium reports a normal termination')((s) => {
          expect(s.termination).toEqual({ _tag: 'Normal' })
        }),
      ),
    )

    scenario(
      'A workload that fails is reported with the exit code it returned',
      Gherkin.Do.pipe(
        Given('a workload scripted to fail when it is told to')(
          'termination',
          () => terminationAfter({ _tag: 'ExitAbnormal' }),
        ),
        Then('the medium reports an abnormal termination carrying that workload exit code')((s) => {
          expect(s.termination).toMatchObject({
            _tag: 'Abnormal',
            report: { _tag: 'ExitReport', code: ABNORMAL_EXIT_CODE },
          })
        }),
      ),
    )

    scenario(
      'A workload that announces readiness is ready for work',
      Gherkin.Do.pipe(
        Given('a workload scripted to announce readiness when it is told to')(
          'probe',
          () => readinessAndProbe,
        ),
        Then('the incarnation is ready and answers its liveness probe')((s) => {
          expect(s.probe).toBe(true)
        }),
      ),
    )

    scenario(
      'Closing an incarnation leaves no virtual machine behind',
      Gherkin.Do.pipe(
        Given('an incarnation whose scope has closed')(
          'remaining',
          () => sandboxesLeftByAnIncarnation,
        ),
        Then('no virtual machine of this package remains')((s) => {
          expect(s.remaining).toEqual([])
        }),
      ),
    )
  })
