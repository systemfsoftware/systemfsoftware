import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Option, Schema } from 'effect'
import type * as Scope from 'effect/Scope'

/**
 * What one probe process opened while it ran. The check's rule reads this: a run that
 * *ends* — its scope closes, because the wait finished or a stop interrupted it — must
 * leave no connection it opened still open. A killed run never ends, so nothing of it
 * unwinds, and the rule does not blame a process for a socket the host closed for it.
 */
export interface ProbeRun {
  open: Array<string>
  dials: number
  ended: boolean
}

/**
 * The fake host socket a probe talks to: it records what each run left open. The real
 * side of this interface is `loopbackService` (a real socket the kernel cannot drive) and
 * the real prober is `Readiness.NodeHostProber`; U12 pairs the fake and the real adapter
 * under one law suite.
 */
export interface ProbeWorld {
  readonly runs: Array<ProbeRun>
  readonly nextConnection: { count: number }
}

export const probeWorld: Effect.Effect<ProbeWorld> = Effect.sync(() => ({ runs: [], nextConnection: { count: 0 } }))

/**
 * How long the fake socket takes to answer, in virtual time: a stop lands inside the call
 * it is cutting, which is where an open connection can be left behind.
 */
const PROBE_LATENCY = '5 millis'

const READY_LOG: ReadonlyArray<string> = ['service listening on 8080']

/** Runs one probe process against the world, marking the run ended when its scope closes. */
export const probingProcess =
  (world: ProbeWorld) => <A, E, R>(body: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Scope.Scope> =>
    Effect.gen(function*() {
      const run = yield* Effect.sync((): ProbeRun => {
        const started: ProbeRun = { open: [], dials: 0, ended: false }
        world.runs.push(started)
        return started
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          run.ended = true
        })
      )
      return yield* body
    })

const currentRun = (world: ProbeWorld): ProbeRun | undefined => world.runs.at(-1)

const openConnection = <A>(world: ProbeWorld, answer: Effect.Effect<A>): Effect.Effect<A> =>
  Effect.scoped(
    Effect.andThen(
      Effect.acquireRelease(
        Effect.sync(() => {
          const connection = `connection-${world.nextConnection.count}`
          world.nextConnection.count += 1
          const run = currentRun(world)
          run?.open.push(connection)
          if (run !== undefined) run.dials += 1
          return connection
        }),
        (connection) =>
          Effect.sync(() => {
            for (const run of world.runs) {
              const index = run.open.indexOf(connection)
              if (index >= 0) run.open.splice(index, 1)
            }
          }),
      ),
      Effect.andThen(Effect.sleep(PROBE_LATENCY), answer),
    ),
  )

const connected: Readiness.DialEvidence = { _tag: 'Connected' }
const responding: Readiness.HttpEvidence = Option.getOrElse(
  Schema.decodeOption(Readiness.Responded)({ _tag: 'Responded', statusCode: 200 }),
  (): Readiness.HttpEvidence => ({ _tag: 'Refused' }),
)

/** The fake host socket: every dial and exchange opens a connection, answers, and closes it. */
export const hostProberOver = (world: ProbeWorld) =>
  Layer.mergeAll(
    Layer.succeed(Readiness.HostProber, {
      dial: () => openConnection(world, Effect.succeed(connected)),
      exchange: () => openConnection(world, Effect.succeed(responding)),
    }),
    Layer.succeed(Readiness.LogSource, { entries: Effect.succeed(READY_LOG) }),
  )

export const holdingProberOver = (world: ProbeWorld) =>
  Layer.mergeAll(
    Layer.succeed(Readiness.HostProber, {
      dial: () => openConnection(world, Effect.never),
      exchange: () => openConnection(world, Effect.never),
    }),
    Layer.succeed(Readiness.LogSource, { entries: Effect.succeed(READY_LOG) }),
  )

/** The rule sentence's evidence: what a run that ended left open, in plain words. */
export const leftOpen = (world: ProbeWorld): string | undefined => {
  const open = world.runs.filter((run) => run.ended).flatMap((run) => run.open)
  if (open.length === 0) return undefined
  return `a run that ended left ${open.length} probe connection(s) open (${open.join(', ')})`
}
