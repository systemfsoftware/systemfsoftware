import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'

interface SessionStoreService {
  readonly accessCount: Effect.Effect<number>
  readonly incrementAccess: Effect.Effect<void>
  readonly activeUser: Effect.Effect<string>
  readonly setUser: (name: string) => Effect.Effect<void>
}

class SessionStore extends Context.Service<SessionStore, SessionStoreService>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/SessionStore',
) {}

const sessionStoreLayer = Layer.effect(
  SessionStore,
  Effect.gen(function*() {
    const accessCounter = yield* Ref.make(0)
    const userRef = yield* Ref.make('guest')
    return {
      accessCount: Ref.get(accessCounter),
      incrementAccess: Ref.update(accessCounter, (n) => n + 1),
      activeUser: Ref.get(userRef),
      setUser: (name: string) => Ref.set(userRef, name),
    }
  }),
)

const Feature = makeFeature({ it })

Feature('Background precondition lifecycle and scenario isolation')
  .withScenarioLayer(sessionStoreLayer)
  .body(({ background, scenario }) => {
    background(
      Gherkin.Do.pipe(
        Given('an active session store')('store', () => SessionStore),
        When('the background registers an initial session touch')('touch', (s) => s.store.incrementAccess),
      ),
    )

    scenario(
      'A first scenario executes with background setup and mutates its local state',
      Gherkin.Do.pipe(
        Given('the session store from the background')('store', () => SessionStore),
        When('the user logs in as administrator')((s) =>
          s.store.setUser('admin').pipe(
            Effect.flatMap(() => s.store.incrementAccess),
          )
        ),
        Then('the session reflects the administrator identity and records two total accesses')((s, expect) =>
          Effect.gen(function*() {
            const user = yield* s.store.activeUser
            const count = yield* s.store.accessCount
            return { user, count }
          }).pipe(
            Effect.map((observation) => expect(observation).toEqual({ user: 'admin', count: 2 })),
          )
        ),
      ),
    )

    scenario(
      'A second scenario receives a fresh background setup and is completely isolated from previous scenario mutations',
      Gherkin.Do.pipe(
        Given('the session store from the fresh background')('store', () => SessionStore),
        Then('the active user is the default guest and the access count reflects only this scenario background')(
          (s, expect) =>
            Effect.gen(function*() {
              const user = yield* s.store.activeUser
              const count = yield* s.store.accessCount
              return { user, count }
            }).pipe(
              Effect.map((observation) => expect(observation).toEqual({ user: 'guest', count: 1 })),
            ),
        ),
      ),
    )
  })
