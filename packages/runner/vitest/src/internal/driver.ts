/**
 * The driver: one Effect that steps the body's generator in the fiber the test runs in.
 *
 * A `yield*` is a step, so the runner sees every one of them (KTD1):
 * - a branded check is judged against this test's ledger, so it counts, and a failed judgement fails the check
 *   itself and stops the test right there (R8);
 * - anything else opens a new observed state and then runs, which is what makes a second check on one state a
 *   second check in one window (R5), and a check inside a loop the same window as its siblings.
 *
 * What counts as a runnable step, and whether it opens a new observed state, is the {@link Interpreter}'s: the fork's
 * lanes run any Effect, and a library that yields its own handles admits only those.
 *
 * The steps run in the same fiber as the test, so layers, virtual time, concurrency, the second run and scope
 * finalizers keep working through the runner unchanged. A step that fails, and the test being interrupted, both
 * return the generator: its `finally` blocks run and the steps after it never start (R8). When the body returns,
 * the gate refuses what the body wrote and never judged, then a body that judged nothing at all (R4).
 *
 * @since 4.1.0
 */
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { Asserted, isCheck, type Ledger } from './checks.js'
import { noCheckRefusal, refusalOf, refuseUnyielded } from './refusals.js'

type Opaque<A = unknown> = A

/**
 * The generator a test body hands over: `function* ({ expect }) { ... }`, or `function* (row, { expect })` per
 * row, called with the run's arguments. Its yield and return types stay open, because the driver steps whatever
 * a body yields without reading the value, error or service channel it yields it in.
 *
 * @internal
 */
export type Body<Arg = never, Y = never, Done = never> = (...args: ReadonlyArray<Arg>) => Iterator<Y, Done, undefined>

type Steps<Y, Done> = Iterator<Y, Done, undefined>

/** @internal */
export type Runnable = Effect.Effect<never, never, never>

/** @internal */
export const isRunnable = (value: unknown): value is Runnable => Effect.isEffect(value)

/**
 * Which yielded values the driver admits and runs, what opens a new observed state, and the texts it refuses with.
 *
 * @internal
 */
export interface Interpreter {
  readonly interpret: (value: Opaque) => Runnable | undefined
  readonly resets: (value: Opaque) => boolean
  readonly refusals: {
    readonly unsteppable: string
    readonly unyielded: string
    readonly noCheck: string
  }
}

const refuseUnsteppable = '✗ the body yielded a value that is not an Effect. Yield the Effect itself, or a check: ' +
  'yield* expect(actual).toEqual(expected).'

/** @internal */
export const defaultInterpreter: Interpreter = {
  interpret: (value) => isRunnable(value) ? value : undefined,
  resets: () => true,
  refusals: { unsteppable: refuseUnsteppable, unyielded: refuseUnyielded, noCheck: noCheckRefusal },
}

const refuse = (text: string): Effect.Effect<never> => Effect.die(refusalOf(text))

const opensState = (ledger: Ledger, effect: Runnable): Runnable =>
  Effect.andThen(Effect.sync(() => ledger.asserted.step()), effect)

const resetsBefore = (value: Opaque, effect: Runnable, interpreter: Interpreter): boolean =>
  !isCheck(effect) && interpreter.resets(value)

const admitted = (value: Opaque, effect: Runnable, ledger: Ledger, interpreter: Interpreter): Runnable =>
  resetsBefore(value, effect, interpreter) ? opensState(ledger, effect) : effect

const runnable = (value: Opaque, ledger: Ledger, interpreter: Interpreter): Runnable => {
  const effect = interpreter.interpret(value)
  return effect === undefined ? refuse(interpreter.refusals.unsteppable) : admitted(value, effect, ledger, interpreter)
}

const stepThrough = <Y, Done>(
  steps: Steps<Y, Done>,
  ledger: Ledger,
  interpreter: Interpreter,
  input: undefined,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const state = steps.next(input)
    if (state.done === true) return Effect.void
    return Effect.flatMap(
      runnable(state.value, ledger, interpreter),
      (value) => stepThrough(steps, ledger, interpreter, value),
    )
  })

const judgedNone = (ledger: Ledger, text: string): Effect.Effect<void> =>
  Effect.suspend(() => ledger.judged() === 0 ? refuse(text) : Effect.void)

const unyielded = (ledger: Ledger, text: string): Effect.Effect<void> =>
  Effect.suspend(() => ledger.unyielded() > 0 ? refuse(text) : Effect.void)

/** @internal */
export const refusingUnyielded = (ledger: Ledger): Effect.Effect<void> => unyielded(ledger, refuseUnyielded)

const gate = (ledger: Ledger, interpreter: Interpreter): Effect.Effect<void> =>
  Effect.andThen(unyielded(ledger, interpreter.refusals.unyielded), judgedNone(ledger, interpreter.refusals.noCheck))

const unwind = <Y, Done>(steps: Steps<Y, Done>): Effect.Effect<void> =>
  Effect.sync(() => {
    steps.return?.(undefined)
  })

/** @internal */
export interface DriveInput<Arg, Y, Done> {
  readonly body: Body<Arg, Y, Done>
  readonly args: ReadonlyArray<Arg>
  readonly ledger: Ledger
  readonly interpreter?: Interpreter
}

const driveBody = <Arg, Y, Done>(
  { args, body, ledger }: DriveInput<Arg, Y, Done>,
  interpreter: Interpreter,
): Effect.Effect<void, never, never> =>
  Effect.suspend(() => {
    const steps = body(...args)
    return Effect.onExit(
      Effect.flatMap(stepThrough(steps, ledger, interpreter, undefined), () => gate(ledger, interpreter)),
      (exit) => Exit.isSuccess(exit) ? Effect.void : unwind(steps),
    )
  })

/**
 * Runs one test's body: `body` called with `args`, stepped against `ledger`, with the ledger's `asserted` provided
 * as `Asserted` so every check in the body — including one yielded inside a forked fiber — reaches it.
 *
 * @internal
 */
export const drive = <Arg = never, Y = never, Done = never>(
  input: DriveInput<Arg, Y, Done>,
): Effect.Effect<void, never, never> =>
  Effect.provideService(
    driveBody(input, input.interpreter ?? defaultInterpreter),
    Asserted,
    input.ledger.asserted,
  )
