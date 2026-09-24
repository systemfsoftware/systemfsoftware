import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Effect, Exit, Fiber, Match, Option, Queue, Ref, Scope } from 'effect'
import { settled, terminatedIn, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it, layer })

/** What a child on the test medium runs: an in-process program, not a fiber program. */
type PortTask = Effect.Effect<void, never, Scope.Scope>

type Log = Ref.Ref<ReadonlyArray<string>>

const recorded = (log: Log) => (entry: string) => Ref.update(log, (seen) => Arr.append(seen, entry))

const PortMedium = Supervisor.Medium.MediumPort<PortTask, never, Scope.Scope>('TestDocumentMedium')

const FailingPort = Supervisor.Medium.MediumPort<PortTask, string, Scope.Scope>('FailingTestMedium')

const PortStartedId: unique symbol = Symbol('test-medium/started')
interface PortStarted extends Supervisor.Medium.Started {
  readonly [PortStartedId]: true
  readonly fiber: Fiber.Fiber<void, never>
  readonly scope: Scope.Scope
}

const isPortStarted = (evidence: Supervisor.Medium.Started): evidence is PortStarted => PortStartedId in evidence

const asPortStarted = (evidence: Supervisor.Medium.Started): Option.Option<PortStarted> =>
  Option.filter(Option.some(evidence), isPortStarted)

/** A medium over in-process tasks that records when each task starts and stops. */
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

Feature('Starting a child on a medium whose start fails')
  .body(({ scenario }) => {
    scenario(
      'A medium that cannot start its child leaves it reported as an abnormal termination',
      Gherkin.Do.pipe(
        Given('a supervisor that runs one child on a medium that will refuse to start it')(
          'tree',
          () =>
            Effect.gen(function*() {
              const startCalled = yield* Deferred.make<void>()
              const refuse = yield* Deferred.make<void>()
              const medium = Supervisor.Medium.make<PortTask, string>({
                declaration: { reporting: 'full', groupStop: 'atomic' },
                start: () =>
                  Effect.andThen(
                    Deferred.succeed(startCalled, void 0),
                    Effect.andThen(Deferred.await(refuse), Effect.fail('the medium refused')),
                  ),
                report: () => Effect.never,
                probe: () => Effect.succeed(false),
                stop: () => Effect.succeed(Supervisor.Medium.stopped),
              })
              const spec = Supervisor.make('failing-medium-tree').pipe(
                Supervisor.children([
                  Supervisor.ChildSpecs.on(FailingPort)('document', Effect.never, { restartType: 'temporary' }),
                ]),
              )
              return { startCalled, refuse, medium, spec }
            }),
        ),
        When('the medium refuses to start the child')('trace', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* tree.spec.scoped.pipe(
              Effect.provideService(FailingPort, { medium: tree.medium }),
            )
            yield* Deferred.await(tree.startCalled)
            const watching = yield* traceUntil(
              supervisor,
              (trace) =>
                Arr.some(trace, (entry) =>
                  Match.value(entry.event).pipe(
                    Match.tag('ChildTerminated', (terminated) => terminated.childId === 'document'),
                    Match.orElse(() => false),
                  )),
            )
            yield* Deferred.succeed(tree.refuse, void 0)
            return yield* settled(watching)
          })),
        Then('the supervisor reports that child as abnormally terminated')(({ trace }) => {
          const ending = Arr.findFirst(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildTerminated', (terminated) => terminated.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(ending).toSatisfy(Option.isSome)
          expect(Option.getOrThrow(ending).event).toMatchObject({
            _tag: 'ChildTerminated',
            reason: { _tag: 'Abnormal', report: { _tag: 'CauseReport' } },
          })
        }),
        And('nothing claims that child ever started')(({ trace }) => {
          const started = Arr.some(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildStarted', (started) => started.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(started).toBe(false)
        }),
      ),
    )

    scenario(
      'A permanent child whose medium keeps refusing to start it is restarted until the supervisor gives up',
      Gherkin.Do.pipe(
        Given('a supervisor whose one child always refuses to start')('tree', () =>
          Effect.gen(function*() {
            const refusals = yield* Queue.unbounded<void>()
            const medium = Supervisor.Medium.make<PortTask, string>({
              declaration: { reporting: 'full', groupStop: 'atomic' },
              start: () => Effect.andThen(Queue.take(refusals), Effect.fail('the medium refused')),
              report: () => Effect.never,
              probe: () => Effect.succeed(false),
              stop: () => Effect.succeed(Supervisor.Medium.stopped),
            })
            const spec = Supervisor.make('persistent-refusal-tree').pipe(
              Supervisor.children([
                Supervisor.ChildSpecs.on(FailingPort)('document', Effect.never, { restartType: 'permanent' }),
              ]),
            )
            return { refusals, medium, spec }
          })),
        When('the supervisor exhausts its restart intensity on refusal')('trace', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* tree.spec.scoped.pipe(
              Effect.provideService(FailingPort, { medium: tree.medium }),
            )
            const watching = yield* traceUntil(supervisor, terminatedIn)
            yield* Effect.forEach(Arr.range(1, 4), () => Queue.offer(tree.refusals, void 0), { discard: true })
            return yield* settled(watching)
          })),
        Then('the supervisor gave up and terminated')(({ trace }) => {
          expect(trace).toSatisfy(terminatedIn)
        }),
        And('the refused child was reported abnormally terminated, never started')(({ trace }) => {
          const endings = Arr.filter(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildTerminated', (terminated) =>
                terminated.childId === 'document' &&
                Match.value(terminated.reason).pipe(
                  Match.tag('Abnormal', () => true),
                  Match.orElse(() => false),
                )),
              Match.orElse(() => false),
            ))
          expect(endings.length).toBeGreaterThan(0)
          const claimedStarted = Arr.filter(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildStarted', (started) => started.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(claimedStarted).toEqual([])
        }),
      ),
    )
  })
