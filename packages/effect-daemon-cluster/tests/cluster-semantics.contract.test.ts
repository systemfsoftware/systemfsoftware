import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Exit, Layer, Ref, Scope } from 'effect'
import { Sharding, Singleton } from 'effect/unstable/cluster'
import { ClusterOracle, warmUpCluster } from './__fixtures__/cluster-oracle.js'

const Feature = makeFeature({ it })

Feature('Keeping one active owner per singleton name')
  .withScenarioLayer(ClusterOracle)
  .live('every singleton is registered with a real SingleRunner over PGlite and Crypto')
  .body(({ scenario }) => {
    scenario(
      'A singleton whose work fails keeps its name and is not restarted',
      Gherkin.Do.pipe(
        Given('a cluster runner that has taken ownership of its shards')('warm', () => warmUpCluster),
        Given('the cluster sharding service')('sharding', () => Sharding.Sharding),
        When('work that always fails is registered as the singleton "orders/failing"')(
          'attempted',
          (s) =>
            Effect.gen(function*() {
              const executions = yield* Ref.make(0)
              const ran = yield* Deferred.make<void>()
              const scope = yield* Scope.make()
              const failing = Effect.gen(function*() {
                yield* Ref.update(executions, (count) => count + 1)
                yield* Deferred.succeed(ran, void 0)
                return yield* Effect.fail('singleton work failed')
              })
              const registration = yield* s.sharding
                .registerSingleton('orders/failing', failing)
                .pipe(Effect.provideService(Scope.Scope, scope), Effect.exit)
              yield* Deferred.await(ran)
              const repeated = yield* s.sharding
                .registerSingleton('orders/failing', Effect.void)
                .pipe(Effect.provideService(Scope.Scope, scope), Effect.exit)
              return { registration, repeated, executions }
            }),
        ),
        Then(
          'the registration is accepted even though the work failed, the work ran exactly once, and the name stays taken',
        )((s, expect) =>
          Effect.map(
            Ref.get(s.attempted.executions),
            (executions) =>
              expect({
                registration: s.attempted.registration,
                executions,
                nameStaysTaken: Exit.isFailure(s.attempted.repeated),
              }).toEqual({ registration: Exit.void, executions: 1, nameStaysTaken: true }),
          )
        ),
      ),
    )

    scenario(
      'A singleton whose work completes holds its name until its registration closes',
      Gherkin.Do.pipe(
        Given('a cluster runner that has taken ownership of its shards')('warm', () => warmUpCluster),
        Given('the cluster sharding service')('sharding', () => Sharding.Sharding),
        When('work that finishes immediately is registered as the singleton "orders/finishing"')(
          'attempted',
          (s) =>
            Effect.gen(function*() {
              const finished = yield* Deferred.make<void>()
              const scope = yield* Scope.make()
              yield* s.sharding
                .registerSingleton('orders/finishing', Deferred.succeed(finished, void 0))
                .pipe(Effect.provideService(Scope.Scope, scope))
              yield* Deferred.await(finished)
              return { scope }
            }),
        ),
        Then('the singleton still holds its name after the work finished, and closing the registration releases it')(
          (s, expect) =>
            Effect.gen(function*() {
              const heldScope = yield* Scope.make()
              const repeated = yield* s.sharding
                .registerSingleton('orders/finishing', Effect.void)
                .pipe(Effect.provideService(Scope.Scope, heldScope), Effect.exit)
              yield* Scope.close(s.attempted.scope, Exit.void)
              const releasedScope = yield* Scope.make()
              const reacquired = yield* s.sharding
                .registerSingleton('orders/finishing', Effect.void)
                .pipe(Effect.provideService(Scope.Scope, releasedScope), Effect.exit)
              return { heldWhileRegistered: Exit.isFailure(repeated), reacquiredAfterClose: reacquired }
            }).pipe(
              Effect.map((observed) =>
                expect(observed).toEqual({ heldWhileRegistered: true, reacquiredAfterClose: Exit.void })
              ),
            ),
        ),
      ),
    )

    scenario(
      'Closing a singleton layer releases the name it held',
      Gherkin.Do.pipe(
        Given('a cluster runner that has taken ownership of its shards')('warm', () => warmUpCluster),
        Given('the cluster sharding service')('sharding', () => Sharding.Sharding),
        When('a layer owning the singleton "orders/layered" is built and then closed')(
          'held',
          (s) =>
            Effect.gen(function*() {
              const scope = yield* Scope.make()
              yield* Layer.build(Singleton.make('orders/layered', Effect.never)).pipe(
                Effect.provideService(Sharding.Sharding, s.sharding),
                Effect.provideService(Scope.Scope, scope),
              )
              const whileHeld = yield* s.sharding
                .registerSingleton('orders/layered', Effect.void)
                .pipe(Effect.provideService(Scope.Scope, scope), Effect.exit)
              yield* Scope.close(scope, Exit.void)
              return { whileHeld }
            }),
        ),
        Then('the name was taken while the layer was open and can be registered again after it closes')(
          (s, expect) =>
            Effect.gen(function*() {
              const scope = yield* Scope.make()
              const reacquired = yield* s.sharding
                .registerSingleton('orders/layered', Effect.void)
                .pipe(Effect.provideService(Scope.Scope, scope), Effect.exit)
              return { takenWhileOpen: Exit.isFailure(s.held.whileHeld), reacquired }
            }).pipe(
              Effect.map((observed) => expect(observed).toEqual({ takenWhileOpen: true, reacquired: Exit.void })),
            ),
        ),
      ),
    )
  })
