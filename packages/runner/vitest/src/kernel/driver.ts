/**
 * The driver: one Effect that steps the body's generator in the fiber the test runs in.
 *
 * A `yield*` is a step, so the runner sees every one of them (KTD1):
 * - a check judges against this test's ledger, so it counts, and a failed judgement fails the check itself and
 *   stops the test right there (R8);
 * - a step that judged no check opens a new observed state, which is what makes a second check on one state a
 *   second check in one window (R5), and a check inside a loop the same window as its siblings. The driver decides
 *   this from what the step did, not from what the interpreter says it is: a check wrapped in an Effect, or yielded
 *   as a handle, still holds the window open.
 *
 * What counts as a runnable step, and which steps may open a new observed state, is the {@link Interpreter}'s: the
 * fork's lanes run any Effect, and a library that yields its own handles admits only those. The driver only
 * drives a ledger {@link makeLedger} returned.
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
import { Asserted, isLedger, type Ledger } from './checks.js'
import { noCheckRefusal, refusalOf, refuseUnyielded } from './refusals.js'

type Opaque<A = unknown> = A

/**
 * The generator a test body hands over: `function* ({ expect }) { ... }`, or `function* (row, { expect })` per
 * row, called with the run's arguments. Its yield and return types stay open, because the driver steps whatever
 * a body yields without reading the value, error or service channel it yields it in.
 */
export type Body<Arg = never, Y = never, Done = never> = (...args: ReadonlyArray<Arg>) => Iterator<Y, Done, undefined>

type Steps<Y, Done> = Iterator<Y, Done, undefined>

export type Runnable = Effect.Effect<never, never, never>

const isRunnable = (value: Opaque): value is Runnable => Effect.isEffect(value)

interface Refusals {
  readonly unsteppable: string
  readonly unyielded: string
  readonly noCheck: string
}

export interface Interpreter {
  readonly interpret: (value: Opaque) => Runnable | undefined
  readonly resets: (value: Opaque) => boolean
  readonly refusals?: Partial<Refusals>
}

const refuseUnsteppable = '✗ the body yielded a value that is not an Effect. Yield the Effect itself, or a check: ' +
  'yield* expect(actual).toEqual(expected).'

const defaultRefusals: Refusals = Object.freeze({
  unsteppable: refuseUnsteppable,
  unyielded: refuseUnyielded,
  noCheck: noCheckRefusal,
})

const defaultInterpreter: Interpreter = Object.freeze({
  interpret: (value: Opaque): Runnable | undefined => isRunnable(value) ? value : undefined,
  resets: (): boolean => true,
})

const stringOr = (candidate: Opaque, fallback: string): string => typeof candidate === 'string' ? candidate : fallback

const refusalsOf = (given: Partial<Refusals> | undefined): Refusals => {
  const reworded = given ?? {}
  return {
    unsteppable: stringOr(reworded.unsteppable, defaultRefusals.unsteppable),
    unyielded: stringOr(reworded.unyielded, defaultRefusals.unyielded),
    noCheck: stringOr(reworded.noCheck, defaultRefusals.noCheck),
  }
}

const refuse = (text: string): Effect.Effect<never> => Effect.die(refusalOf(text))

const opensNewState = (ledger: Ledger, resets: boolean, judgedBefore: number): boolean =>
  resets && ledger.judged() === judgedBefore

const opensStateAfter = (ledger: Ledger, resets: boolean, judgedBefore: number): Effect.Effect<void> =>
  Effect.sync(() => {
    if (opensNewState(ledger, resets, judgedBefore)) ledger.asserted.step()
  })

const stepping = (value: Opaque, effect: Runnable, ledger: Ledger, interpreter: Interpreter): Runnable =>
  Effect.suspend(() => {
    const judgedBefore = ledger.judged()
    return Effect.tap(effect, () => opensStateAfter(ledger, interpreter.resets(value), judgedBefore))
  })

const runnable = (value: Opaque, ledger: Ledger, interpreter: Interpreter, texts: Refusals): Runnable => {
  const effect = interpreter.interpret(value)
  return effect === undefined ? refuse(texts.unsteppable) : stepping(value, effect, ledger, interpreter)
}

const stepThrough = <Y, Done>(
  steps: Steps<Y, Done>,
  ledger: Ledger,
  interpreter: Interpreter,
  texts: Refusals,
  input: undefined,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const state = steps.next(input)
    if (state.done === true) return Effect.void
    return Effect.flatMap(
      runnable(state.value, ledger, interpreter, texts),
      (value) => stepThrough(steps, ledger, interpreter, texts, value),
    )
  })

const judgedNone = (ledger: Ledger, text: string): Effect.Effect<void> =>
  Effect.suspend(() => ledger.judged() === 0 ? refuse(text) : Effect.void)

const unyielded = (ledger: Ledger, text: string): Effect.Effect<void> =>
  Effect.suspend(() => ledger.unyielded() > 0 ? refuse(text) : Effect.void)

export const refusingUnyielded = (ledger: Ledger): Effect.Effect<void> => unyielded(ledger, refuseUnyielded)

const gate = (ledger: Ledger, texts: Refusals): Effect.Effect<void> =>
  Effect.andThen(unyielded(ledger, texts.unyielded), judgedNone(ledger, texts.noCheck))

const unwind = <Y, Done>(steps: Steps<Y, Done>): Effect.Effect<void> =>
  Effect.sync(() => {
    steps.return?.(undefined)
  })

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
    const texts = refusalsOf(interpreter.refusals)
    return Effect.onExit(
      Effect.flatMap(stepThrough(steps, ledger, interpreter, texts, undefined), () => gate(ledger, texts)),
      (exit) => Exit.isSuccess(exit) ? Effect.void : unwind(steps),
    )
  })

const driveLedger = <Arg, Y, Done>(input: DriveInput<Arg, Y, Done>): Effect.Effect<void, never, never> =>
  Effect.provideService(
    driveBody(input, input.interpreter ?? defaultInterpreter),
    Asserted,
    input.ledger.asserted,
  )

export const drive = <Arg = never, Y = never, Done = never>(
  input: DriveInput<Arg, Y, Done>,
): Effect.Effect<void, never, never> =>
  Effect.suspend(() =>
    isLedger(input.ledger)
      ? driveLedger(input)
      : Effect.die(new Error('drive needs a ledger that makeLedger returned'))
  )
