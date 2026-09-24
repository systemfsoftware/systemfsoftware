# @systemfsoftware/effect-daemon-spec

Erlang/OTP supervision trees for [Effect](https://effect.website). A supervisor starts its children in order, restarts the ones that fail according to its strategy, each child's restart type and its restart intensity, and stops them in reverse order when its scope closes. It does this the way OTP's `supervisor` does.

Every supervision decision is made by a pure fold over supervision events, and each step of that fold is published on the supervisor's trace, so what the supervisor did and why is something you can read, not guess.

## Install

```bash
pnpm add @systemfsoftware/effect-daemon-spec effect
```

> [!NOTE]
> `effect` is a peer dependency: you bring your own.

## Quick start

A child is an Effect. A bare Effect counts as started as soon as it runs; a function of `ready` counts as started when it calls `ready`, for example once a server is listening.

```ts
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect, Layer } from 'effect'

const database = Effect.andThen(Effect.log('database connected'), Effect.never)

const httpServer = (ready: Effect.Effect<void>) =>
  Effect.gen(function*() {
    yield* Effect.log('listening on :8080')
    yield* ready
    return yield* Effect.never
  })

const app = Supervisor.make('app').pipe(
  Supervisor.strategy('rest_for_one'),
  Supervisor.intensity(3, 5_000),
  Supervisor.children([
    Supervisor.ChildSpecs.make('database', database),
    Supervisor.ChildSpecs.make('http', httpServer),
  ]),
)

Layer.launch(app.layer).pipe(Effect.runFork)
```

If the database fails, `rest_for_one` stops the HTTP server, restarts the database, and starts the server again. A fourth restart within five seconds stops both children and terminates the supervisor.

Use `app.scoped` instead of `app.layer` to get the running supervisor handle inside your own scope.

## Restart strategies

| Strategy                | When a child terminates and must restart                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `one_for_one` (default) | Only that child restarts.                                                                        |
| `one_for_all`           | Every child stops in reverse order, then all start again in declared order.                      |
| `rest_for_one`          | The children declared after it stop in reverse order; it and they start again in declared order. |

`Supervisor.intensity(n, periodMillis)` allows at most `n` restarts within `periodMillis`. The default is OTP's: one restart in five seconds. One more restart than that stops every child and terminates the supervisor; whoever is waiting on it observes a give-up (see [Observing a running supervisor](#observing-a-running-supervisor)).

## Children

`Supervisor.ChildSpecs.make(id, program, options)` declares a child. Every option is optional; the first three default as OTP does.

| Option               | Values                                                                                                                                                                                           | Default                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `restartType`        | `permanent` always restarts; `transient` restarts only after an abnormal exit; `temporary` never restarts                                                                                        | `permanent`                                            |
| `shutdown`           | `{ _tag: 'Brutal' }` interrupts without waiting; `{ _tag: 'Graceful', millis }` interrupts and waits up to `millis` for finalizers; `{ _tag: 'Infinity' }` waits for them however long they take | `Graceful` 5000 ms, `Infinity` for a nested supervisor |
| `significant`        | with `Supervisor.autoShutdown('any_significant' \| 'all_significant')`, the exit of a significant child shuts the supervisor down                                                                | `false`                                                |
| `startTimeoutMillis` | a child not ready within this time counts as an abnormal termination                                                                                                                             | 5000                                                   |

`Supervisor.child(id, program, options)` appends a single child.

### Choosing the medium a child runs on

`Supervisor.ChildSpecs.make` binds a child to the fiber medium. When a child should run on something else — a process, a socket, a machine — declare a medium port and bind the child to it. A port is a `Context.Service` keyed to the program type it interprets; its driver provides the medium as a layer, so one tree can mix media while the strategy, order and policy never mention one.

```ts
import { Effect, Layer, Scope } from 'effect'

const DocumentPort = Supervisor.Medium.MediumPort<
  Effect.Effect<void, never, Scope.Scope>,
  never,
  Scope.Scope
>('DocumentMedium')

const tree = Supervisor.make('app').pipe(
  Supervisor.children([
    Supervisor.ChildSpecs.make('http', httpServer), // the fiber medium
    Supervisor.ChildSpecs.on(DocumentPort)('document', documentTask), // the port's medium
  ]),
)

const provided = tree.layer.pipe(
  Layer.provideMerge(Layer.succeed(DocumentPort, { medium: documentMedium })),
)
```

A port a child is bound to joins the tree's requirements, so `tree.scoped` and `tree.layer` wait for it. A port medium whose `start` fails reports that incarnation as an abnormal termination; nothing claims the child started.

## Nested supervisors

A supervisor spec is itself a valid child program, so trees nest to any depth:

```ts
const workers = Supervisor.make('workers').pipe(
  Supervisor.strategy('one_for_all'),
  Supervisor.children([
    Supervisor.ChildSpecs.make('ingest', database),
    Supervisor.ChildSpecs.make('export', database),
  ]),
)

const root = Supervisor.make('root').pipe(
  Supervisor.children([Supervisor.ChildSpecs.make('workers', workers)]),
)
```

Stopping the nested supervisor waits for its whole subtree to shut down first.

## Dynamic children

A supervisor declared with `Supervisor.dynamic` starts children on request, up to a ceiling. Each start allocates the child's id and answers whether it was accepted:

```ts
const pool = Supervisor.make('jobs').pipe(
  Supervisor.dynamic({ ceiling: 100, restartType: 'temporary' }),
)

const runJob = (job: Effect.Effect<void>) =>
  Effect.scoped(
    Effect.gen(function*() {
      const jobs = yield* pool.scoped
      const reply = yield* Supervisor.startChild(jobs, Supervisor.readyOnStart(job))
      // { outcome: 'accepted', childId, generation } or { outcome: 'refused' } at the ceiling
      return reply
    }),
  )
```

`Supervisor.stopChild(running, childId, generation)` stops that incarnation and answers `stopped`, or `missed` when it is no longer current.

## Beyond OTP

Two behaviours OTP does not have are available when you declare them:

- `Supervisor.coolDown(millis)`: on intensity exhaustion, stop the children, wait, and start them again instead of terminating.
- `Supervisor.backoff({ baseMillis, multiplier, capMillis })`: space out consecutive restarts of the same child.

## Observing a running supervisor

`Supervisor.traceOf(running)` is a `Stream` of every step the supervisor takes: the event it received (a child started, terminated, a timer elapsed, a request arrived) and the decision it made, including the children it stopped and started. `Supervisor.statusOf(running)` reads its current phase and children, and `Supervisor.awaitTerminated(running)` settles when it has terminated.

The wait succeeds when the supervisor ended because it was asked to shut down or because a significant child's exit shut it down. It fails with `Supervisor.SupervisorTerminated` when the supervisor gave up after exceeding its restart intensity: the error carries the supervisor's name, its own termination reason, and the `Cause` of the child termination that exhausted it — a fiber child's real exit cause, or the child's termination reason for any other medium. Every child has stopped and its finalizers have run before the wait settles. A supervisor that gives up under a parent ends as an abnormal child of that parent, so a chain of give-ups escalates to the top-level owner.

## License

[Apache-2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/effect-daemon-spec/LICENSE)
