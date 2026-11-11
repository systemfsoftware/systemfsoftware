/**
 * Every refusal the fork prints, as the one text it uses on both channels: the `this` type (or parameter union)
 * the compiler prints at the call site, and the message thrown at run time.
 *
 * The tables are a floor. The fork's rows are frozen, a library that consumes the kernel passes {@link TableRows},
 * and {@link resolveTables} lays them over the fork's rows: a library can reword a refusal and add refusals of its
 * own, and it cannot remove or narrow one.
 *
 * @since 4.0.0
 */

/**
 * The brand every run-time refusal carries. A test is run a second time on a fresh build to catch leaked state,
 * so when that second run fails with a refusal the fork itself made, the runner re-throws the refusal rather than
 * relabelling it as a leak (see `throwSecondRun` in `runner.ts`). The brand is a `Symbol.for` value because a
 * worker holds two copies of these modules at once — the setup file's `dist/guard.mjs` beside the test graph's
 * `src/mod.ts` — and a refusal thrown by either copy has to be recognisable to the other, exactly as the guard's
 * window is shared.
 */
const refusalBrand = Symbol.for('@systemfsoftware/vitest/refusal')

type Opaque<A = unknown> = A

export const refusalOf = (text: string): Error => {
  const error = new Error(text)
  Reflect.set(error, refusalBrand, true)
  return error
}

export const isRefusal = (error: Opaque): error is Error =>
  error instanceof Error && Reflect.get(error, refusalBrand) === true

export const refusedText = Object.freeze(
  {
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
  } as const,
)

export type refusedText = typeof refusedText

export const negatedText = Object.freeze(
  {
    ...refusedText,
    toBeNull:
      '✗ not.toBeNull passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
    toBeUndefined:
      '✗ not.toBeUndefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  } as const,
)

export type negatedText = typeof negatedText

export const neededText = Object.freeze(
  {
    toThrow:
      '✗ toThrow() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
    toThrowError:
      '✗ toThrowError() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
    toSatisfy:
      '✗ toSatisfy(predicate) fails with \'expected x to satisfy [Function]\'. Say what must hold: toSatisfy(predicate, "every line has a positive quantity").',
    toMatchObject:
      '✗ toMatchObject({}) matches every object. Name the fields that must hold: toMatchObject({ status: "Pending" }).',
  } as const,
)

export type neededText = typeof neededText

export const booleanRefusal =
  '✗ expect(<boolean>) can only report \'expected false to be true\'. Pass the two values instead: yield* expect(a).toEqual(b), which uses Effect Equal. A predicate: yield* expect(value).toSatisfy(predicate, "what must hold").'

export type booleanRefusal = typeof booleanRefusal

export type BooleanRefusal = typeof booleanRefusal

export const refusePiecewise =
  '✗ a second check on the same state. Checking a state piece by piece reports one field at a time and misses the ones never checked. Assert the state once: yield* expect(order).toMatchObject({ id: 1, status: "Pending" }), or gather what you observed: yield* expect({ total, status }).toEqual({ total: Money.of(4.4), status: "Pending" }). A check inside a loop is the same: assert the whole array once. Several inputs: it.each(rows)(name, function* (row, { expect }) { ... }).'

export type refusePiecewise = typeof refusePiecewise

export type RefusePiecewise = typeof refusePiecewise

export const refuseVacuous =
  '✗ this check asserts nothing, so it cannot fail. Call one matcher in the judgement: mint((make) => make(actual).toEqual(expected)).'

export const refuseUnyielded =
  '✗ a check was written but never yielded, so it never ran. Yield it: yield* expect(actual).toEqual(expected).'

export type refuseUnyielded = typeof refuseUnyielded

export type RefuseUnyielded = typeof refuseUnyielded

export const noCheckRefusal =
  "✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count."

export type noCheckRefusal = typeof noCheckRefusal

export type NoCheckRefusal = typeof noCheckRefusal

export const unprovidedText =
  '✗ the test needs a service that nothing provides. Write the test inside layer(Service.layer)((it) => { it(name, ...) }); every test gets its own fresh build.'

export type unprovidedText = typeof unprovidedText

export type UnprovidedRefusal = typeof unprovidedText

export const refuseEffectBody =
  '✗ the body returned an Effect, so the runner cannot see its steps. Pass the generator itself: it(name, function* ({ expect }) { ... }).'

export type refuseEffectBody = typeof refuseEffectBody

export type RefuseEffectBody = typeof refuseEffectBody

export const refuseAsyncBody =
  '✗ an async body runs outside the test runtime. Pass a generator: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }).'

export type refuseAsyncBody = typeof refuseAsyncBody

export type RefuseAsyncBody = typeof refuseAsyncBody

export const refuseSyncBody =
  '✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

export type refuseSyncBody = typeof refuseSyncBody

export type RefuseSyncBody = typeof refuseSyncBody

export const refuseEffectLane =
  '✗ it.effect is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

export type refuseEffectLane = typeof refuseEffectLane

export type EffectLaneRefusal = typeof refuseEffectLane

export const refuseScopedLane =
  '✗ it.scoped is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

export type refuseScopedLane = typeof refuseScopedLane

export type ScopedLaneRefusal = typeof refuseScopedLane

export const refuseScopedLiveLane =
  '✗ it.scopedLive is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).'

export type refuseScopedLiveLane = typeof refuseScopedLiveLane

export type ScopedLiveLaneRefusal = typeof refuseScopedLiveLane

export const refuseHook =
  '✗ hooks share state between tests. Build what a test needs inside it; services come fresh per test from layer(Service.layer)((it) => { ... }).'

export type refuseHook = typeof refuseHook

export type HookRefusal = typeof refuseHook

export const refuseRawExpect =
  '✗ an expect imported from vitest ran; take it from the test callback: it(name, function* ({ expect }) { ... })'

export type refuseRawExpect = typeof refuseRawExpect

export const refuseRawIt = "✗ this test was registered with vitest's it; import it from @systemfsoftware/vitest"

export type refuseRawIt = typeof refuseRawIt

/**
 * The resolved vocabulary of the check surface: which matchers are refused and with what text.
 *
 * - `refused` and `negated` name matchers (`to...`) whose call is refused, and `expect.<static>` / `.resolves` /
 *   `.rejects` reads that are refused: `anything`, `poll`, `soft`, `resolves`, `rejects`.
 * - `needed` names the matchers whose empty call is refused: `toThrow`, `toThrowError`, `toSatisfy`,
 *   `toMatchObject`.
 * - `boolean` is the text of `expect(<boolean>)`.
 *
 * @since 4.1.0
 */
export interface Tables {
  readonly refused: object
  readonly negated: object
  readonly needed: object
  readonly boolean: string
}

export interface RuntimeTables extends Tables {
  readonly refused: { readonly [matcher: string]: string }
  readonly negated: { readonly [matcher: string]: string }
  readonly needed: { readonly [matcher: string]: string }
}

/**
 * What a library that consumes the kernel passes: rows laid over the fork's own, which stay in force whatever is
 * passed. A row names a matcher the library also refuses, or rewords one the fork already refuses; `refused`
 * rows apply to `.not` too unless `negated` words them otherwise. Only the four matchers the fork already needs
 * arguments for can be reworded under `needed`. A row cannot be removed.
 *
 * @since 4.1.0
 */
export interface TableRows {
  readonly refused?: { readonly [matcher: string]: string }
  readonly negated?: { readonly [matcher: string]: string }
  readonly needed?: { readonly [matcher in keyof neededText]?: string }
  readonly boolean?: string
}

export const forkTables = Object.freeze(
  {
    refused: refusedText,
    negated: negatedText,
    needed: neededText,
    boolean: booleanRefusal,
  } as const satisfies Tables,
)

export type ForkTables = typeof forkTables

type Override<Base, Rows> = {
  readonly [K in keyof Base | keyof Rows]: K extends keyof Rows ? Rows[K] : K extends keyof Base ? Base[K] : never
}

type RowsIn<Rows, Key extends string> = Rows extends { readonly [K in Key]: infer Found } ? Found
  : Record<never, never>

export type ResolvedTables<Rows extends TableRows> = {
  readonly refused: Override<refusedText, RowsIn<Rows, 'refused'>>
  readonly negated: Override<Override<negatedText, RowsIn<Rows, 'refused'>>, RowsIn<Rows, 'negated'>>
  readonly needed: Override<neededText, RowsIn<Rows, 'needed'>>
  readonly boolean: Rows extends { readonly boolean: infer Text extends string } ? Text : booleanRefusal
}

const anyKey = (): boolean => true

const knownIn = (table: object) => (key: string): boolean => Object.hasOwn(table, key)

const isKept = (known: (key: string) => boolean, key: string, text: Opaque): text is string =>
  typeof text === 'string' && known(key)

const rowOf = (
  known: (key: string) => boolean,
  [key, text]: readonly [string, Opaque],
): ReadonlyArray<readonly [string, string]> => isKept(known, key, text) ? [[key, text]] : []

const entriesOf = (rows: Readonly<Record<string, Opaque>> | undefined): ReadonlyArray<readonly [string, Opaque]> =>
  Object.entries(rows ?? {})

const rowsOf = (
  rows: Readonly<Record<string, Opaque>> | undefined,
  known: (key: string) => boolean,
): Record<string, string> => Object.fromEntries(entriesOf(rows).flatMap((entry) => rowOf(known, entry)))

const booleanTextOf = (rows: TableRows): string => typeof rows.boolean === 'string' ? rows.boolean : booleanRefusal

export const resolveTables = (rows: TableRows | undefined): RuntimeTables => {
  const given = rows ?? {}
  return Object.freeze({
    refused: Object.freeze({ ...refusedText, ...rowsOf(given.refused, anyKey) }),
    negated: Object.freeze({ ...negatedText, ...rowsOf(given.refused, anyKey), ...rowsOf(given.negated, anyKey) }),
    needed: Object.freeze({ ...neededText, ...rowsOf(given.needed, knownIn(neededText)) }),
    boolean: booleanTextOf(given),
  })
}

export interface GateTexts {
  readonly noCheck: string
  readonly unprovided: string
  readonly syncBody: string
  readonly asyncBody: string
  readonly effectBody: string
}

export interface ForkGateTexts extends GateTexts {
  readonly noCheck: NoCheckRefusal
  readonly unprovided: UnprovidedRefusal
  readonly syncBody: RefuseSyncBody
  readonly asyncBody: RefuseAsyncBody
  readonly effectBody: RefuseEffectBody
}
