import { it, VitestTestContext } from '@systemfsoftware/vitest'
import {
  type Asserted,
  drive,
  expectFor,
  type Handle,
  type Interpreter,
  isHandle,
  type Ledger,
  type LedgerOptions,
  makeHandle,
  makeLedger,
  type Mint,
  type Runnable,
  type Subject,
} from '@systemfsoftware/vitest/kernel'
import { Cause, Effect, Fiber, Option, pipe, Predicate } from 'effect'

type Opaque<A = unknown> = A

const NOT_A_HANDLE = 'consumer: yield a step handle, not a bare Effect'

const PIECEWISE = 'consumer: one check per observed state'

const VACUOUS = 'consumer: the judgement asserted nothing'

const consumerOptions: LedgerOptions = { piecewise: PIECEWISE, vacuous: VACUOUS }

interface StepPayload {
  readonly effect: Effect.Effect<void, never, Asserted>
  readonly opensState: boolean
}

type Step = Handle<void, Asserted> & StepPayload

const step = (effect: Effect.Effect<void, never, Asserted>, opensState: boolean): Step =>
  makeHandle({ effect, opensState })

const act = (effect: Effect.Effect<void, never, Asserted>): Step => step(effect, true)

const observe = (effect: Effect.Effect<void, never, Asserted>): Step => step(effect, false)

const isStep = (value: Opaque): value is Step => isHandle(value) && Object.hasOwn(value, 'effect')

const isRunnable = (value: Opaque): value is Runnable => Effect.isEffect(value)

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
  refusals: { unsteppable: NOT_A_HANDLE },
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

const refusalIn = (thunk: () => Opaque) =>
  Effect.match(
    Effect.try({ try: thunk, catch: (thrown) => Predicate.isError(thrown) ? thrown.message : 'not an error' }),
    { onFailure: (message) => message, onSuccess: () => 'no refusal' },
  )

const invoke = (member: () => Opaque): Opaque => member()

const callWith = (call: (value: Opaque) => Opaque, value: Opaque): Opaque => call(value)

const outcomeOf = <Y>(ledger: Ledger, body: () => Iterator<Y, void, undefined>, use: Interpreter) =>
  drive({ body, args: [], ledger, interpreter: use }).pipe(
    Effect.as({ passed: true, message: '' }),
    Effect.catchCause((cause) => Effect.succeed({ passed: false, message: messageOf(cause) })),
    Effect.map((outcome) => ({ ...outcome, judged: ledger.judged() })),
  )

const settleWith = <Y>(
  use: Interpreter,
  options: LedgerOptions,
  program: (ledger: Ledger) => Iterator<Y, void, undefined>,
) =>
  Effect.gen(function*() {
    const ledger = makeLedger({ ...options, ctx: yield* testContext })
    return yield* outcomeOf(ledger, () => program(ledger), use)
  })

const settle = <Y>(program: (ledger: Ledger) => Iterator<Y, void, undefined>) =>
  settleWith(interpreter, consumerOptions, program)

it('Should_CountTheCheckOnce_When_ConsumerSubjectMintsIt', function*({ expect }) {
  const result = yield* settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 1 })
})

it('Should_KeepEveryForkRefusal_When_ConsumerTablePassesNoRows', function*({ expect }) {
  const ledger = makeLedger({ ctx: yield* testContext, tables: { refused: {}, negated: {}, needed: {} } })
  const consumer = expectFor({ ledger })
  const refusals = {
    weak: yield* refusalIn(() => invoke(consumer(1).toBeTruthy)),
    negated: yield* refusalIn(() => invoke(consumer(1).not.toBeNull)),
    resolves: yield* refusalIn(() => consumer(1).resolves),
    anything: yield* refusalIn(() => consumer.anything),
    emptyMatch: yield* refusalIn(() => invoke(consumer({}).toMatchObject)),
    bareThrow: yield* refusalIn(() => invoke(consumer(() => 1).toThrow)),
    boolean: yield* refusalIn(() => callWith(consumer, true)),
  }
  yield* expect(refusals).toEqual({
    weak: expect.stringContaining('✗ toBeTruthy passes for almost any value'),
    negated: expect.stringContaining('✗ not.toBeNull passes for almost any value'),
    resolves: expect.stringContaining('✗ .resolves/.rejects assert on a Promise'),
    anything: expect.stringContaining('✗ expect.anything() matches every value'),
    emptyMatch: expect.stringContaining('✗ toMatchObject({}) matches every object'),
    bareThrow: expect.stringContaining('✗ toThrow() passes for any error'),
    boolean: expect.stringContaining('✗ expect(<boolean>) can only report'),
  })
})

it('Should_RewordAndAddRefusals_When_ConsumerTablePassesRows', function*({ expect }) {
  const ledger = makeLedger({
    ctx: yield* testContext,
    tables: {
      refused: { toBeTruthy: 'consumer: assert the value', toBeCloseTo: 'consumer: no approximate checks' },
      needed: { toThrow: 'consumer: name the error' },
      boolean: 'consumer: no booleans',
    },
  })
  const consumer = expectFor({ ledger })
  const refusals = {
    reworded: yield* refusalIn(() => invoke(consumer(1).toBeTruthy)),
    rewordedNegation: yield* refusalIn(() => invoke(consumer(1).not.toBeTruthy)),
    added: yield* refusalIn(() => invoke(consumer(1).toBeCloseTo)),
    rewordedNeed: yield* refusalIn(() => invoke(consumer(() => 1).toThrow)),
    boolean: yield* refusalIn(() => callWith(consumer, true)),
    untouched: yield* refusalIn(() => invoke(consumer(1).toBeFalsy)),
  }
  yield* expect(refusals).toEqual({
    reworded: 'consumer: assert the value',
    rewordedNegation: 'consumer: assert the value',
    added: 'consumer: no approximate checks',
    rewordedNeed: 'consumer: name the error',
    boolean: 'consumer: no booleans',
    untouched: expect.stringContaining('✗ toBeFalsy passes for almost any value'),
  })
})

it('Should_RefuseSoftAndPoll_When_ConsumerTableOmitsOrRewordsThem', function*({ expect }) {
  const omitting = expectFor({ ledger: makeLedger({ ctx: yield* testContext, tables: { refused: {} } }) })
  const rewording = expectFor({
    ledger: makeLedger({
      ctx: yield* testContext,
      tables: { refused: { poll: 'consumer: use a locator check with a timeout' } },
    }),
  })
  const refusals = {
    soft: yield* refusalIn(() => omitting.soft),
    poll: yield* refusalIn(() => omitting.poll),
    reworded: yield* refusalIn(() => rewording.poll),
  }
  yield* expect(refusals).toEqual({
    soft: expect.stringContaining('✗ expect.soft reports several failures'),
    poll: expect.stringContaining('✗ expect.poll waits on the real clock'),
    reworded: 'consumer: use a locator check with a timeout',
  })
})

it('Should_LeaveNonMatcherMembersAbsent_When_ConsumerReadsThem', function*({ expect }) {
  const consumer = expectFor({ ledger: makeLedger({ ctx: yield* testContext }) })
  const typo = 'toBeTruthyy'
  yield* expect({
    toString: typeof consumer(1).toString,
    valueOf: typeof consumer(1).valueOf,
    typo: typeof Reflect.get(consumer(1), typo),
  }).toEqual({ toString: 'undefined', valueOf: 'undefined', typo: 'undefined' })
})

it('Should_RefuseTheBoolean_When_SubjectMatchesBooleans', function*({ expect }) {
  const booleans: Subject<boolean, Record<never, never>> = {
    matches: (actual): actual is boolean => typeof actual === 'boolean',
    checks: () => ({}),
  }
  const consumer = expectFor({ ledger: makeLedger({ ctx: yield* testContext }), subjects: [booleans] })
  yield* expect(yield* refusalIn(() => callWith(consumer, true))).toEqual(
    expect.stringContaining('✗ expect(<boolean>) can only report'),
  )
})

it('Should_RefuseTheSecondCheck_When_ReadKeepsTheWindow', function*({ expect }) {
  const result = yield* settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
    yield* observe(Effect.void)
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: false, message: PIECEWISE, judged: 2 })
})

it('Should_AdmitTheSecondCheck_When_ActOpensANewState', function*({ expect }) {
  const result = yield* settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [locatorSubject] })
    yield* consumer(locator('Ready')).toHaveText('Ready')
    yield* act(Effect.void)
    yield* consumer(locator('Ready')).toHaveText('Ready')
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 2 })
})

it('Should_RefuseTheSecondCheck_When_TheFirstIsWrappedInAnOpeningStep', function*({ expect }) {
  const wrapped = (check: Step): Step => act(Effect.withSpan(check.effect, 'wrapped'))
  const result = yield* settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [locatorSubject] })
    yield* wrapped(consumer(locator('a')).toHaveText('a'))
    yield* wrapped(consumer(locator('b')).toHaveText('b'))
  })
  yield* expect(result).toEqual({ passed: false, message: PIECEWISE, judged: 2 })
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
  const consumer = expectFor({ ledger: makeLedger({ ctx: yield* testContext }), subjects: [first, second] })
  yield* expect(consumer('text').which).toEqual('first')
})

const judgedBy = (judgement: Parameters<Mint>[0]): Subject<Locator, { readonly check: () => Step }> => ({
  matches: (actual): actual is Locator => Predicate.hasProperty(actual, 'text'),
  checks: (_actual: Locator, mint: Mint) => ({ check: () => observe(mint(judgement)) }),
})

const settleJudgement = (judgement: Parameters<Mint>[0]) =>
  settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [judgedBy(judgement)] })
    yield* consumer(locator('a')).check()
  })

it('Should_RefuseAJudgement_When_ItCallsNoMatcher', function*({ expect }) {
  const result = yield* settleJudgement(() => undefined)
  yield* expect(result).toEqual({ passed: false, message: VACUOUS, judged: 1 })
})

it('Should_RefuseAJudgement_When_ItCallsTwoMatchers', function*({ expect }) {
  const result = yield* settleJudgement((make) => {
    make(1).toBe(1)
    make(2).toBe(2)
  })
  yield* expect(result).toEqual({ passed: false, message: PIECEWISE, judged: 1 })
})

it('Should_RefuseAWeakMatcher_When_JudgementCallsIt', function*({ expect }) {
  const result = yield* settleJudgement((make) => make(1).toBeTruthy())
  yield* expect(result).toEqual({
    passed: false,
    message: expect.stringContaining('✗ toBeTruthy passes for almost any value'),
    judged: 1,
  })
})

it('Should_ReachTheLedger_When_CheckIsYieldedInForkedFiber', function*({ expect }) {
  const result = yield* settle(function*(ledger) {
    const consumer = expectFor({ ledger, subjects: [locatorSubject] })
    yield* act(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(consumer(locator('a')).toHaveText('a').effect)
        yield* Fiber.join(fiber)
      }),
    )
  })
  yield* expect(result).toEqual({ passed: true, message: '', judged: 1 })
})

it('Should_RefuseWithTheConsumerText_When_BodyYieldsValueTheInterpreterDoesNotAdmit', function*({ expect }) {
  const result = yield* settle(function*() {
    yield* Effect.void
  })
  yield* expect(result).toEqual({ passed: false, message: NOT_A_HANDLE, judged: 0 })
})

it('Should_RefuseToDrive_When_LedgerIsNotMadeByMakeLedger', function*({ expect }) {
  const real = makeLedger({ ctx: yield* testContext })
  const result = yield* outcomeOf({ ...real }, function*() {
    yield* Effect.void
  }, interpreter)
  yield* expect(result).toEqual({
    passed: false,
    message: 'drive needs a ledger that makeLedger returned',
    judged: 0,
  })
})
