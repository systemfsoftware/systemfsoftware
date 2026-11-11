import { it, VitestTestContext } from '@systemfsoftware/vitest'
import {
  type Asserted,
  defaultInterpreter,
  drive,
  expectFor,
  forkTables,
  type Handle,
  type Interpreter,
  isHandle,
  isRunnable,
  type Ledger,
  type LedgerOptions,
  makeHandle,
  makeLedger,
  type Mint,
  mintCheck,
  refusedText,
  refusePiecewise,
  type Runnable,
  type Subject,
} from '@systemfsoftware/vitest/kernel'
import { Cause, Effect, Fiber, Option, pipe, Predicate } from 'effect'

type Opaque<A = unknown> = A

const NOT_A_HANDLE = 'consumer: yield a step handle, not a bare Effect'

interface StepPayload {
  readonly effect: Effect.Effect<void, never, Asserted>
  readonly opensState: boolean
}

type Step = Handle<void, Asserted> & StepPayload

const step = (effect: Effect.Effect<void, never, Asserted>, opensState: boolean): Step =>
  makeHandle<void, Asserted, StepPayload>({ effect, opensState })

const act = (effect: Effect.Effect<void, never, Asserted>): Step => step(effect, true)

const observe = (effect: Effect.Effect<void, never, Asserted>): Step => step(effect, false)

const isStep = (value: unknown): value is Step => isHandle(value) && Object.hasOwn(value, 'effect')

const runnableOf = (value: Opaque): Runnable | undefined =>
  pipe(
    Option.liftPredicate(value, isStep),
    Option.map((candidate) => candidate.effect),
    Option.filter(isRunnable),
    Option.getOrUndefined,
  )

const interpreter: Interpreter = {
  interpret: runnableOf,
  resets: (value) => Option.exists(Option.liftPredicate(value, isStep), (candidate) => candidate.opensState),
  refusals: { ...defaultInterpreter.refusals, unsteppable: NOT_A_HANDLE },
}

const locatorSubject: Subject<Locator, { readonly toHaveText: (expected: string) => Step }> = {
  matches: (actual): actual is Locator => Predicate.hasProperty(actual, 'text'),
  checks: (actual: Locator, mint: Mint) => ({
    toHaveText: (expected: string) => observe(mint((make) => make(actual.text).toBe(expected))),
  }),
}

interface Locator {
  readonly text: string
}

const locator = (text: string): Locator => ({ text })

const messageOf = (cause: Cause.Cause<never>): string =>
  Cause.prettyErrors(cause).map((error) => error.message).join('')

const testContext = Effect.gen(function*() {
  return Option.getOrThrow(Option.fromNullishOr(yield* VitestTestContext))
})

const settleWith = <Y>(
  use: Interpreter,
  options: LedgerOptions,
  program: (ledger: Ledger) => Iterator<Y, void, undefined>,
) =>
  Effect.gen(function*() {
    const ledger = makeLedger({ ...options, ctx: yield* testContext })
    return yield* drive({ body: () => program(ledger), args: [], ledger, interpreter: use }).pipe(
      Effect.as({ passed: true, message: '' }),
      Effect.catchCause((cause) => Effect.succeed({ passed: false, message: messageOf(cause) })),
      Effect.map((outcome) => ({ ...outcome, judged: ledger.judged() })),
    )
  })

const settle = <Y>(options: LedgerOptions, program: (ledger: Ledger) => Iterator<Y, void, undefined>) =>
  settleWith(interpreter, options, program)

it('Should_CountTheCheckOnce_When_ConsumerSubjectMintsIt', function*({ expect }) {
  const result = yield* settle({}, function*(ledger) {
    const consumer = expectFor({ written: ledger.written, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 1 })
})

it('Should_AcceptToBeTruthy_When_ConsumerTableOmitsIt', function*({ expect }) {
  const { toBeTruthy: _omitted, ...refused } = refusedText
  const result = yield* settleWith(defaultInterpreter, {}, function*(ledger) {
    const consumer = expectFor({ written: ledger.written, tables: { ...forkTables, refused } })
    yield* consumer(1).toBeTruthy()
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 1 })
})

it('Should_RefuseWithTheOriginalText_When_ForkTableIsUsed', function*({ expect }) {
  const strict = expectFor({ written: () => undefined })
  yield* expect(() => strict(1).toBeTruthy.call(refusedText.toBeTruthy)).toThrow(refusedText.toBeTruthy)
})

it('Should_RefuseTheSecondCheck_When_ReadKeepsTheWindow', function*({ expect }) {
  const result = yield* settle({}, function*(ledger) {
    const consumer = expectFor({ written: ledger.written, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
    yield* observe(Effect.void)
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: false, message: refusePiecewise, judged: 2 })
})

it('Should_AdmitTheSecondCheck_When_ActOpensANewState', function*({ expect }) {
  const result = yield* settle({}, function*(ledger) {
    const consumer = expectFor({ written: ledger.written, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
    yield* act(Effect.void)
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 2 })
})

it('Should_UseTheFirstListedSubject_When_TwoSubjectsMatch', function*({ expect }) {
  const first: Subject<string, { readonly which: 'first' }> = {
    matches: (actual): actual is string => typeof actual === 'string',
    checks: () => ({ which: 'first' }),
  }
  const second: Subject<string, { readonly which: 'second' }> = {
    matches: (actual): actual is string => typeof actual === 'string',
    checks: () => ({ which: 'second' }),
  }
  const consumer = expectFor({ written: () => undefined, subjects: [first, second] })
  yield* expect(consumer('text').which).toEqual('first')
})

it('Should_RefuseSoftAndPoll_When_ConsumerTableOmitsThem', function*({ expect }) {
  const omitting = expectFor({ written: () => undefined, tables: { ...forkTables, refused: {} } })
  yield* expect(() => omitting.soft).toThrow(refusedText.soft)
  yield* Effect.void
  yield* expect(() => omitting.poll).toThrow(refusedText.poll)
})

it('Should_ReplaceOnlyTheWording_When_ConsumerTableTextsPoll', function*({ expect }) {
  const rewording = expectFor({
    written: () => undefined,
    tables: { ...forkTables, refused: { poll: 'consumer: use a locator check with a timeout' } },
  })
  yield* expect(() => rewording.poll).toThrow('consumer: use a locator check with a timeout')
})

it('Should_ReachTheLedger_When_CheckIsYieldedInForkedFiber', function*({ expect }) {
  const result = yield* settle({}, function*(ledger) {
    yield* act(
      Effect.gen(function*() {
        const check = mintCheck({ written: ledger.written, judgement: () => undefined })
        const fiber = yield* Effect.forkChild(check)
        yield* Fiber.join(fiber)
      }),
    )
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 1 })
})

it('Should_RefuseWithTheConsumerText_When_BodyYieldsValueTheInterpreterDoesNotAdmit', function*({ expect }) {
  const result = yield* settle({}, function*() {
    yield* Effect.void
  })
  yield* expect(result).toEqual({ passed: false, message: NOT_A_HANDLE, judged: 0 })
})
