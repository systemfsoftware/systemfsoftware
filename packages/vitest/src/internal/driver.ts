/**
 * The driver: one Effect that steps the body's generator in the fiber the test runs in.
 *
 * A `yield*` is a step, so the runner sees every one of them (KTD1):
 * - a branded check is judged against this test's ledger, so it counts, and a failed judgement fails the check
 *   itself and stops the test right there (R8);
 * - anything else opens a new observed state and then runs, which is what makes a second check on one state a
 *   second check in one window (R5), and a check inside a loop the same window as its siblings.
 *
 * The steps run in the same fiber as the test, so layers, virtual time, concurrency, the second run and scope
 * finalizers keep working through the runner unchanged. A step that fails, and the test being interrupted, both
 * return the generator: its `finally` blocks run and the steps after it never start (R8). When the body returns,
 * the gate refuses what the body wrote and never judged, then a body that judged nothing at all (R4).
 */
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Function from 'effect/Function'
import { Asserted, isCheck, type Ledger } from './checks.js'
import { noCheckRefusal, refusalOf, refuseUnyielded } from './refusals.js'

/**
 * The generator a test body hands over: `function* ({ expect }) { ... }`, or `function* (row, { expect })` per
 * row, called with the run's arguments. Its yield and return types stay open, because the driver steps whatever
 * a body yields without reading the value, error or service channel it yields it in.
 *
 * @internal
 */
export type Body<Arg = never, Y = never, Done = never> = (...args: ReadonlyArray<Arg>) => Iterator<Y, Done, undefined>

/** A body's iterator: every `next` hands back the value the body yielded, and the first has nothing to feed it. */
type Steps<Y, Done> = Iterator<Y, Done, undefined>

/**
 * A value the body yielded, as the driver runs it. What a body needs of its environment belongs to the layer the
 * runner provides around this whole Effect, so the driver erases the channels here, exactly as the runner erases
 * a body's own (`outputIsEffect` in `runner.ts`): the layer block is where a requirement is checked, and a body
 * that needs a service nothing provides is refused by the runner at run time (R9).
 */
const isRunnable = (value: unknown): value is Effect.Effect<never, never, never> => Effect.isEffect(value)

/** A body that yielded something the driver cannot run ran nothing, so nothing in the test could fail. */
const refuseUnsteppable = '✗ the body yielded a value that is not an Effect. Yield the Effect itself, or a check: ' +
  'yield* expect(actual).toEqual(expected).'

/**
 * A yielded Effect: a branded check judges itself, and anything else opens a new observed state before it runs,
 * which is what resets the ledger's one-check window (R5).
 */
const runEffect = (value: Effect.Effect<never, never, never>, ledger: Ledger): Effect.Effect<never, never, never> =>
  isCheck(value) ? value : Effect.andThen(Effect.sync(() => ledger.asserted.step()), value)

/** One step: anything the driver cannot run is refused, because then no step of the test ran at all. */
const runStep = <Y>(value: Y, ledger: Ledger): Effect.Effect<never, never, never> =>
  isRunnable(value) ? runEffect(value, ledger) : Effect.die(refusalOf(refuseUnsteppable))

/** Steps the iterator to its end, feeding each yielded Effect's result back into the body. */
const stepThrough = <Y, Done>(steps: Steps<Y, Done>, ledger: Ledger, input: undefined): Effect.Effect<void> =>
  Effect.suspend(() => {
    const state = steps.next(input)
    if (state.done === true) return Effect.void
    return Effect.flatMap(runStep(state.value, ledger), (value) => stepThrough(steps, ledger, value))
  })

/**
 * After the body returns: a check written and never yielded is refused first, then a body that judged none.
 * Both carry the same text the refusal carries on its compile channel, branded by `refusalOf` so the runner's
 * second run re-throws them as the refusals they are.
 */
const gate = (ledger: Ledger): Effect.Effect<void> =>
  Effect.suspend(() => ledger.unyielded() > 0 ? refuse(refuseUnyielded) : judgedNone(ledger))

const judgedNone = (ledger: Ledger): Effect.Effect<void> => ledger.judged() === 0 ? refuse(noCheckRefusal) : Effect.void

const refuse = (text: string): Effect.Effect<never> => Effect.die(refusalOf(text))

/**
 * A failure or an interruption returns the generator, so its `finally` blocks run and the step after the failed
 * check never does (R8).
 */
const unwind = <Y, Done>(steps: Steps<Y, Done>): Effect.Effect<void> =>
  Effect.sync(() => {
    steps.return?.(undefined)
  })

const driveBody = <Arg, Y, Done>(
  body: Body<Arg, Y, Done>,
  args: ReadonlyArray<Arg>,
  ledger: Ledger,
): Effect.Effect<void, never, never> =>
  Effect.suspend(() => {
    const steps = body(...args)
    return Effect.onExit(
      Effect.flatMap(stepThrough(steps, ledger, undefined), () => gate(ledger)),
      (exit) => Exit.isSuccess(exit) ? Effect.void : unwind(steps),
    )
  })

/** The body's steps, with this test's ledger provided as the `Asserted` every check in it reaches for. */
const driven = <Arg, Y, Done>(
  body: Body<Arg, Y, Done>,
  args: ReadonlyArray<Arg>,
  ledger: Ledger,
): Effect.Effect<void, never, never> => Effect.provideService(driveBody(body, args, ledger), Asserted, ledger.asserted)

type Drive = {
  <Arg = never, Y = never, Done = never>(
    body: Body<Arg, Y, Done>,
    args: ReadonlyArray<Arg>,
    ledger: Ledger,
  ): Effect.Effect<void, never, never>
  <Arg = never, Y = never, Done = never>(
    args: ReadonlyArray<Arg>,
    ledger: Ledger,
  ): (body: Body<Arg, Y, Done>) => Effect.Effect<void, never, never>
}

/**
 * Runs one test's body: `body` called with `args`, stepped against `ledger`, with the ledger's `asserted`
 * provided as `Asserted` so every check in the body — including one yielded inside a forked fiber — reaches it.
 *
 * @internal
 */
export const drive: Drive = Function.dual(3, driven)
