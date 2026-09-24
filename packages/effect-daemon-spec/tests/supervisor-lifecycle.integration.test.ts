import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { neverChild, settled, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type Trace = ReadonlyArray<Supervisor.TraceEntry>

const stoppedSeen = (childId: string) => (trace: Trace): boolean =>
  Arr.some(trace, (entry) =>
    Match.value(entry.event).pipe(
      Match.tag('ChildStopped', (stopped) => stopped.childId === childId),
      Match.orElse(() => false),
    ))

const runningChildIds = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => Arr.empty<string>()),
      Match.orElse((running) => Arr.map(running.core.children, (child) => child.childId)),
    ))

/** The child a start answer names, or an empty identity when the answer names none. */
const childIdOfStart = (answer: Supervisor.DynamicOutcome): string =>
  Match.value(answer).pipe(
    Match.when({ outcome: 'accepted' }, (accepted) => accepted.childId),
    Match.orElse(() => ''),
  )

/** A supervisor that takes new children up to `ceiling`, running none of its own. */
const dynamicSupervisor = (name: string, ceiling: number) =>
  Effect.map(
    Supervisor.make(name).pipe(Supervisor.dynamic({ ceiling })).scoped,
    (supervisor) => ({ supervisor }),
  )

Feature('Growing and shrinking a running supervision tree')
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'A start beyond the declared ceiling is turned away',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two')(
          'tree',
          () => dynamicSupervisor('ceiling-tree', 2),
        ),
        When('three children are started in turn')('answers', ({ tree }) =>
          Effect.gen(function*() {
            const first = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const second = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const before = yield* runningChildIds(tree.supervisor)
            const third = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const after = yield* runningChildIds(tree.supervisor)
            return { first, second, third, before, after }
          })),
        Then(
          'the first two answers name the children the supervisor allocated, the third is turned away, and the running children are unchanged',
        )(({ answers }, expect) =>
          expect({
            first: answers.first,
            second: answers.second,
            third: answers.third,
            before: answers.before,
            after: answers.after,
          }).toEqual({
            first: { outcome: 'accepted', childId: 'd0', generation: 0 },
            second: { outcome: 'accepted', childId: 'd1', generation: 0 },
            third: { outcome: 'refused' },
            before: ['d0', 'd1'],
            after: ['d0', 'd1'],
          })
        ),
      ),
    )

    scenario(
      'A child stopped on request leaves the tree',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, running one it allocated')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('stop-tree', 2)
              const answer = yield* Supervisor.startChild(tree.supervisor, neverChild)
              return { ...tree, answer }
            }),
        ),
        When('that child is stopped, and then the same incarnation is stopped again')(
          'answers',
          ({ tree }) =>
            Effect.gen(function*() {
              const childId = childIdOfStart(tree.answer)
              const leaving = yield* traceUntil(tree.supervisor, stoppedSeen(childId))
              const answer = yield* Supervisor.stopChild(tree.supervisor, childId, 0)
              yield* settled(leaving)
              yield* Effect.yieldNow
              const remaining = yield* runningChildIds(tree.supervisor)
              const again = yield* Supervisor.stopChild(tree.supervisor, childId, 0)
              const afterwards = yield* runningChildIds(tree.supervisor)
              return { answer, remaining, again, afterwards }
            }),
        ),
        Then(
          'the first stop is answered as done and the child leaves the tree, and the second stop finds no such incarnation',
        )(({ answers }, expect) =>
          expect({
            answer: answers.answer,
            remaining: answers.remaining,
            again: answers.again,
            afterwards: answers.afterwards,
          }).toEqual({
            answer: { outcome: 'stopped' },
            remaining: [],
            again: { outcome: 'missed' },
            afterwards: [],
          })
        ),
      ),
    )

    scenario(
      'A request made after the supervisor has stopped is still answered',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, which has since shut down')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('stopped-tree', 2)
              yield* Supervisor.shutdown(tree.supervisor)
              return tree
            }),
        ),
        When('a new child is asked for and a child is asked to stop')('answers', ({ tree }) =>
          Effect.gen(function*() {
            const start = yield* Supervisor.startChild(tree.supervisor, neverChild)
            const stop = yield* Supervisor.stopChild(tree.supervisor, 'd0', 0)
            return { start, stop }
          })),
        Then('the new child is turned away and the stop finds no such child')(({ answers }, expect) =>
          expect({ start: answers.start, stop: answers.stop }).toEqual({
            start: { outcome: 'refused' },
            stop: { outcome: 'missed' },
          })
        ),
      ),
    )

    scenario(
      'A stop naming an incarnation that cannot exist is answered at once',
      Gherkin.Do.pipe(
        Given('a supervisor that takes new children up to a ceiling of two, running one it allocated')(
          'tree',
          () =>
            Effect.gen(function*() {
              const tree = yield* dynamicSupervisor('impossible-stop-tree', 2)
              const answer = yield* Supervisor.startChild(tree.supervisor, neverChild)
              return { ...tree, answer }
            }),
        ),
        When('a stop names an incarnation of that child that could never have been started')(
          'answers',
          ({ tree }) =>
            Effect.gen(function*() {
              const answer = yield* Supervisor.stopChild(tree.supervisor, childIdOfStart(tree.answer), -1)
              const remaining = yield* runningChildIds(tree.supervisor)
              return { answer, remaining }
            }),
        ),
        Then('the stop finds no such child and the running child stays in the tree')(({ answers }, expect) =>
          expect({ answer: answers.answer, remaining: answers.remaining }).toEqual({
            answer: { outcome: 'missed' },
            remaining: ['d0'],
          })
        ),
      ),
    )
  })
