import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Effect, Exit, Fiber, Layer, Option, Ref, Scope } from 'effect'

const Feature = makeFeature({ it })

type PortTask = Effect.Effect<void, never, Scope.Scope>

type Log = Ref.Ref<ReadonlyArray<string>>

const recorded = (log: Log) => (entry: string) => Ref.update(log, (seen) => Arr.append(seen, entry))

const PortMedium = Supervisor.Medium.MediumPort<PortTask, never, Scope.Scope>('TestDocumentMedium')

const PortStartedId: unique symbol = Symbol('test-medium/started')
interface PortStarted extends Supervisor.Medium.Started {
  readonly [PortStartedId]: true
  readonly fiber: Fiber.Fiber<void, never>
  readonly scope: Scope.Scope
}

const isPortStarted = (evidence: Supervisor.Medium.Started): evidence is PortStarted => PortStartedId in evidence

const asPortStarted = (evidence: Supervisor.Medium.Started): Option.Option<PortStarted> =>
  Option.filter(Option.some(evidence), isPortStarted)

const recordingMedium = (log: Log) =>
  Supervisor.Medium.make({
    declaration: { reporting: 'full', groupStop: 'atomic' },
    start: (task: PortTask) =>
      Effect.gen(function*() {
        yield* recorded(log)('port started')
        const scope = yield* Effect.scope
        const fiber = yield* Effect.forkIn(task, scope)
        const evidence: PortStarted = {
          ...Supervisor.Medium.started(Effect.void),
          [PortStartedId]: true,
          fiber,
          scope,
        }
        return evidence
      }),
    report: (evidence) =>
      Option.match(asPortStarted(evidence), {
        onNone: () => Effect.succeed({ _tag: 'Shutdown' } as const),
        onSome: (self) => Effect.as(Fiber.await(self.fiber), { _tag: 'Shutdown' } as const),
      }),
    probe: (evidence) =>
      Option.match(asPortStarted(evidence), {
        onNone: () => Effect.succeed(false),
        onSome: (self) => Effect.sync(() => self.fiber.pollUnsafe() === undefined),
      }),
    stop: (evidence, _mode): Effect.Effect<Supervisor.Medium.Stopped, never, Scope.Scope> =>
      Effect.gen(function*() {
        yield* recorded(log)('port stopped')
        yield* Option.match(asPortStarted(evidence), {
          onNone: () => Effect.void,
          onSome: (self) => Effect.andThen(Fiber.interrupt(self.fiber), Scope.close(self.scope, Exit.void)),
        })
        return Supervisor.Medium.stopped
      }),
  })

Feature('Mixing media in one supervision tree')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A child on a named medium and a fiber child start and stop in the supervisor order',
      Gherkin.Do.pipe(
        Given('a supervisor that runs a child on a named medium before a fiber child')(
          'tree',
          () =>
            Effect.gen(function*() {
              const log = yield* Ref.make<ReadonlyArray<string>>([])
              const fiberStarted = yield* Deferred.make<void>()
              const spec = Supervisor.make('mixed-tree').pipe(
                Supervisor.children([
                  Supervisor.ChildSpecs.on(PortMedium)('document', Effect.never),
                  Supervisor.ChildSpecs.make('worker', (ready) =>
                    Effect.ensuring(
                      Effect.andThen(
                        Effect.andThen(ready, recorded(log)('fiber started')),
                        Effect.andThen(Deferred.succeed(fiberStarted, void 0), Effect.never),
                      ),
                      recorded(log)('fiber stopped'),
                    )),
                ]),
              )
              return { log, fiberStarted, spec, medium: recordingMedium(log) }
            }),
        ),
        When('the scope it runs in closes')('order', ({ tree }) =>
          Effect.gen(function*() {
            const started = yield* Effect.scoped(
              Effect.gen(function*() {
                yield* tree.spec.scoped.pipe(
                  Effect.provideService(PortMedium, { medium: tree.medium }),
                )
                yield* Deferred.await(tree.fiberStarted)
                return yield* Ref.get(tree.log)
              }),
            )
            const afterwards = yield* Ref.get(tree.log)
            return { started, afterwards }
          })),
        Then('the children started in the order the supervisor declared them')(({ order }) => {
          expect(order.started).toEqual(['port started', 'fiber started'])
        }),
        And('the children stopped in reverse of that order')(({ order }) => {
          expect(order.afterwards).toEqual([
            'port started',
            'fiber started',
            'fiber stopped',
            'port stopped',
          ])
        }),
      ),
    )
  })
