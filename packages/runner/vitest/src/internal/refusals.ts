/**
 * Every refusal the fork prints, as the one text it uses on both channels: the `this` type (or parameter union)
 * the compiler prints at the call site, and the message thrown at run time.
 *
 * Surface: `it(name, function* ({ expect }) { ... })`. Ported verbatim from the prototype's `checks.ts`; the
 * prototype's `test(` surfaces are rewritten to `it(`, and `refusedText` gained the `expect` statics
 * (`.resolves`, `.rejects`, `expect.anything`, `expect.poll`, `expect.soft`).
 *
 * @since 4.0.0
 */
import type { Breach } from './failure-record.js'

/**
 * The brand every run-time refusal carries. A test is run a second time on a fresh build to catch leaked state,
 * so when that second run fails with a refusal the fork itself made, the runner re-throws the refusal rather than
 * relabelling it as a leak (see `throwSecondRun` in `runner.ts`). The brand is a `Symbol.for` value because a
 * worker holds two copies of these modules at once — the setup file's `dist/guard.mjs` beside the test graph's
 * `src/mod.ts` — and a refusal thrown by either copy has to be recognisable to the other, exactly as the guard's
 * window is shared.
 */
const refusalBrand = Symbol.for('@systemfsoftware/vitest/refusal')

/** The error a refusal throws: the refusal text, branded so {@link isRefusal} recognises it. */
/** @internal */
export const refusalOf = (text: string): Error => {
  const error = new Error(text)
  Reflect.set(error, refusalBrand, true)
  return error
}

/** Whether an error is one of the fork's own refusals, rather than a failure of the test under it. */
/** @internal */
export const isRefusal = (error: unknown): error is Error =>
  error instanceof Error && Reflect.get(error, refusalBrand) === true

/** @internal */
export const refusedText = {
  toBeDefined:
    '✗ toBeDefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeTruthy:
    '✗ toBeTruthy passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeFalsy:
    '✗ toBeFalsy passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toHaveLength:
    '✗ toHaveLength checks how many, not which. Assert the contents: toEqual([...]); only some of them: toEqual(expect.arrayContaining([...])).',
  toHaveProperty:
    '✗ toHaveProperty checks one key at a time. Assert the shape once: toMatchObject({ key: value, ... }).',
  toBeInstanceOf:
    '✗ toBeInstanceOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).',
  toBeTypeOf:
    '✗ toBeTypeOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).',
  toHaveBeenCalled:
    '✗ toHaveBeenCalled passes for any call with any arguments. Assert what the call carried: toHaveBeenCalledExactlyOnceWith(...args).',
  toHaveBeenCalledTimes:
    '✗ toHaveBeenCalledTimes counts calls, not what they carried. Assert the calls: toHaveBeenNthCalledWith(n, ...args), or all of them: expect(spy.mock.calls).toEqual([[...], [...]]).',
  toMatchSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toMatchInlineSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toMatchFileSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toThrowErrorMatchingSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. Name the error: toThrow(MyError).',
  toThrowErrorMatchingInlineSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. Name the error: toThrow(MyError).',
  resolves:
    '✗ .resolves/.rejects assert on a Promise outside the test runtime. Yield the Effect: const value = yield* program; its failure: const error = yield* Effect.flip(program); then yield* expect(error).toEqual(new MyError(...)).',
  rejects:
    '✗ .resolves/.rejects assert on a Promise outside the test runtime. Yield the Effect: const value = yield* program; its failure: const error = yield* Effect.flip(program); then yield* expect(error).toEqual(new MyError(...)).',
  anything:
    '✗ expect.anything() matches every value. Say what the value must be: expect.any(Money), expect.objectContaining({ ... }), expect.schemaMatching(Schema).',
  poll:
    '✗ expect.poll waits on the real clock, outside the runner\'s virtual time. Let time pass inside the test: yield* TestClock.adjust("3 seconds"); then yield* expect(value).toEqual(expected).',
  soft:
    '✗ expect.soft reports several failures on one state; the fork reports the state once. Assert the state once: yield* expect(actual).toEqual(expected).',
} as const

/** @internal */
export type refusedText = typeof refusedText

/** @internal */
export const negatedText = {
  ...refusedText,
  toBeNull:
    '✗ not.toBeNull passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeUndefined:
    '✗ not.toBeUndefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
} as const

/** @internal */
export type negatedText = typeof negatedText

/** @internal */
export const neededText = {
  toThrow:
    '✗ toThrow() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
  toThrowError:
    '✗ toThrowError() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
  toSatisfy:
    '✗ toSatisfy(predicate) fails with \'expected x to satisfy [Function]\'. Say what must hold: toSatisfy(predicate, "every line has a positive quantity").',
  toMatchObject:
    '✗ toMatchObject({}) matches every object. Name the fields that must hold: toMatchObject({ status: "Pending" }).',
} as const

/** @internal */
export type neededText = typeof neededText

/** @internal */
export const booleanRefusal =
  '✗ expect(<boolean>) can only report \'expected false to be true\'. Pass the two values instead: yield* expect(a).toEqual(b), which uses Effect Equal. A predicate: yield* expect(value).toSatisfy(predicate, "what must hold").'

/** @internal */
export type booleanRefusal = typeof booleanRefusal

/** @internal */
export type BooleanRefusal = typeof booleanRefusal

/** @internal */
export const refusePiecewise =
  '✗ a second check on the same state. Checking a state piece by piece reports one field at a time and misses the ones never checked. Assert the state once: yield* expect(order).toMatchObject({ id: 1, status: "Pending" }), or gather what you observed: yield* expect({ total, status }).toEqual({ total: Money.of(4.4), status: "Pending" }). A check inside a loop is the same: assert the whole array once. Several inputs: it.each(rows)(name, function* (row, { expect }) { ... }).'

/** @internal */
export type refusePiecewise = typeof refusePiecewise

/** @internal */
export type RefusePiecewise = typeof refusePiecewise

/** @internal */
export const refuseUnyielded =
  '✗ a check was written but never yielded, so it never ran. Yield it: yield* expect(actual).toEqual(expected).'

/** @internal */
export type refuseUnyielded = typeof refuseUnyielded

/** @internal */
export type RefuseUnyielded = typeof refuseUnyielded

/** @internal */
export const noCheckRefusal =
  "✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count."

/** @internal */
export type noCheckRefusal = typeof noCheckRefusal

/** @internal */
export type NoCheckRefusal = typeof noCheckRefusal

/** @internal */
export const unprovidedText =
  '✗ the test needs a service that nothing provides. Write the test inside layer(Service.layer)((it) => { it(name, ...) }); every test gets its own fresh build.'

/** @internal */
export type unprovidedText = typeof unprovidedText

/** @internal */
export type UnprovidedRefusal = typeof unprovidedText

/** @internal */
export const refuseEffectBody =
  '✗ the body returned an Effect, so the runner cannot see its steps. Pass the generator itself: it(name, function* ({ expect }) { ... }).'

/** @internal */
export type refuseEffectBody = typeof refuseEffectBody

/** @internal */
export type RefuseEffectBody = typeof refuseEffectBody

/** @internal */
export const refuseAsyncBody =
  '✗ an async body runs outside the test runtime. Pass a generator: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }).'

/** @internal */
export type refuseAsyncBody = typeof refuseAsyncBody

/** @internal */
export type RefuseAsyncBody = typeof refuseAsyncBody

/** @internal */
export const refuseSyncBody =
  '✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

/** @internal */
export type refuseSyncBody = typeof refuseSyncBody

/** @internal */
export type RefuseSyncBody = typeof refuseSyncBody

/** @internal */
export const refuseEffectLane =
  '✗ it.effect is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

/** @internal */
export type refuseEffectLane = typeof refuseEffectLane

/** @internal */
export type EffectLaneRefusal = typeof refuseEffectLane

/** @internal */
export const refuseScopedLane =
  '✗ it.scoped is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

/** @internal */
export type refuseScopedLane = typeof refuseScopedLane

/** @internal */
export type ScopedLaneRefusal = typeof refuseScopedLane

/** @internal */
export const refuseScopedLiveLane =
  '✗ it.scopedLive is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

/** @internal */
export type refuseScopedLiveLane = typeof refuseScopedLiveLane

/** @internal */
export type ScopedLiveLaneRefusal = typeof refuseScopedLiveLane

/** @internal */
export const refuseHook =
  '✗ hooks share state between tests. Build what a test needs inside it; services come fresh per test from layer(Service.layer)((it) => { ... }).'

/** @internal */
export type refuseHook = typeof refuseHook

/** @internal */
export type HookRefusal = typeof refuseHook

/** @internal */
export const refuseRawExpect =
  '✗ an expect imported from vitest ran; take it from the test callback: it(name, function* ({ expect }) { ... })'

/** @internal */
export type refuseRawExpect = typeof refuseRawExpect

/** @internal */
export const refuseRawIt = "✗ this test was registered with vitest's it; import it from @systemfsoftware/vitest"

/** @internal */
export type refuseRawIt = typeof refuseRawIt

/**
 * The fixed prose each breach of the record contract is refused with (R10, KTD7). A refusal carries this text and
 * nothing from the record itself, and nothing ever reads it back, so a refusal cannot recurse. The breach letter is
 * not printed: a reader acts on what is missing, not on which requirement numbered it.
 */
/** @internal */
export const refusedRecordText = {
  R1: 'the headline is empty',
  R2: 'the record names no source location',
  R6: 'a replay value names a run no generator chose, or the rerun line is missing',
} as const

/** @internal */
export type refusedRecordText = typeof refusedRecordText

/** The one detail a record refusal carries: every breach the renderer found, in the prose above (R10). */
/** @internal */
export const refusedRecordDetail = (breaches: ReadonlyArray<Breach>): string =>
  `✗ refused a failure record: ${breaches.map((breach) => refusedRecordText[breach]).join(', and ')}`
