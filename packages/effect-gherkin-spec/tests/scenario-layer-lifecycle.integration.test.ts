import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'

interface LifecycleCounters {
  readonly opened: number
  readonly closed: number
}

interface ScenarioWorkspace {
  readonly marker: string
}

class Lifecycle extends Context.Service<Lifecycle, Ref.Ref<LifecycleCounters>>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/ScenarioLifecycle',
) {}

class Workspace extends Context.Service<Workspace, ScenarioWorkspace>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/ScenarioWorkspace',
) {}

const lifecycleLayer = Layer.effect(Lifecycle, Ref.make<LifecycleCounters>({ opened: 0, closed: 0 }))

const scenarioWorkspaceLayer = Layer.effect(
  Workspace,
  Effect.gen(function*() {
    const counters = yield* Lifecycle
    return yield* Effect.acquireRelease(
      Effect.gen(function*() {
        const opened = yield* Ref.updateAndGet(counters, (current) => ({
          opened: current.opened + 1,
          closed: current.closed,
        }))
        return { marker: `workspace-${opened.opened}` }
      }),
      () => Ref.update(counters, (current) => ({ opened: current.opened, closed: current.closed + 1 })),
    )
  }),
)

const Feature = makeFeature({ it })

Feature('A scenario fixture is opened fresh for each scenario')
  .withLayer(lifecycleLayer)
  .withScenarioLayer(scenarioWorkspaceLayer)
  .body(({ scenario }) => {
    scenario(
      'The first scenario opens its own workspace and nothing has closed yet',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the first scenario')('workspace', () => Workspace),
        Then('the first workspace is open and none has been released')((s, expect) =>
          Effect.gen(function*() {
            const counters = yield* Lifecycle
            return { marker: s.workspace.marker, counters: yield* Ref.get(counters) }
          }).pipe(Effect.map((facts) =>
            expect(facts).toEqual({
              marker: 'workspace-1',
              counters: { opened: 1, closed: 0 },
            })
          ))
        ),
      ),
    )

    scenario(
      'A later scenario opens a fresh workspace instead of inheriting the earlier one',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the later scenario')('workspace', () => Workspace),
        When('the later scenario reads its workspace marker')('marker', (s) => Effect.succeed(s.workspace.marker)),
        Then('the later scenario sees its own fresh workspace and nothing has been released')((s, expect) =>
          Effect.gen(function*() {
            const counters = yield* Lifecycle
            return { marker: s.marker, counters: yield* Ref.get(counters) }
          }).pipe(Effect.map((facts) =>
            expect(facts).toEqual({
              marker: 'workspace-1',
              counters: { opened: 1, closed: 0 },
            })
          ))
        ),
      ),
    )
  })
