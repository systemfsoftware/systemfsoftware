/// <reference types="vitest/importMeta" />
/**
 * The one replay grammar (KTD10, R6): the `CONFORMANCE_REPLAY` text a failure record's rerun line carries and
 * the spec runtime reads back to re-run the same schedule. The text names the seed a generator chose and the
 * decisions it took, in order — `seed=7;path=1,2,3` — and the path is empty when the run took no decision
 * (`seed=1;path=`). A text that names neither is not a replay.
 *
 * The seed and every decision are branded whole numbers (CONST-D3), and the text is a codec rooted at
 * `Schema.String`, so one declaration serves both the writer and the reader instead of a pattern each.
 *
 * @since 4.0.0
 */
import { Effect, Option, Schema, SchemaGetter, SchemaIssue } from 'effect'

/** The seed a replay names: the whole number a generator chose, never negative (CONST-D3). */
export const ReplaySeed = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('ReplaySeed'),
)
/** @since 4.0.0 */
export type ReplaySeed = typeof ReplaySeed.Type

/** One decision along a replay path: the index the scheduler picked at that step (CONST-D3). */
export const ReplayStep = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('ReplayStep'),
)
/** @since 4.0.0 */
export type ReplayStep = typeof ReplayStep.Type

/** The replay a generator chose: its seed and the decisions it took, in order (R6). */
export const Replay = Schema.Struct({
  seed: ReplaySeed,
  path: Schema.Array(ReplayStep),
})
/** @since 4.0.0 */
export type Replay = typeof Replay.Type

type EncodedReplay = typeof Replay.Encoded

const SEED_PREFIX = 'seed='
const PATH_PREFIX = 'path='
const PAIR_SEPARATOR = ';'
const ENTRY_SEPARATOR = ','
const WHOLE_NUMBER = /^\d+$/u

const NOT_A_REPLAY = 'a replay reads "seed=<whole number>;path=<comma-separated whole numbers>"'

/**
 * The boundary values a replay's whole numbers refuse: a negative seed, a negative decision, and values that are
 * not whole numbers at all. The generated laws only ever draw accepted values, so the refusal side is pinned by
 * the in-source law below against the boundaries a draw never reaches.
 */
const REFUSED_REPLAY_NUMBERS: ReadonlyArray<number> = [
  -3,
  -1,
  0,
  1,
  2.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
]

/** The domain rule both refinements restate: a replay names whole numbers that are not negative. */
const namesAWholeNumber = (value: number): boolean => Number.isInteger(value) && value >= 0

const and = (left: boolean, right: boolean): boolean => left && right

const wholeNumberOf = (text: string): number | undefined => WHOLE_NUMBER.test(text) ? Number(text) : undefined

const seedDigitsOf = (text: string): string | undefined =>
  text.startsWith(SEED_PREFIX) ? text.slice(SEED_PREFIX.length) : undefined

const pathDigitsOf = (text: string): string | undefined =>
  text.startsWith(PATH_PREFIX) ? text.slice(PATH_PREFIX.length) : undefined

const entriesOf = (text: string): ReadonlyArray<string> => text.length === 0 ? [] : text.split(ENTRY_SEPARATOR)

const wholeNumbersOf = (entries: ReadonlyArray<string>): ReadonlyArray<number> | undefined => {
  const numbers = entries.map(wholeNumberOf)
  return numbers.every((value) => value !== undefined) ? numbers : undefined
}

const seedIn = (part: string): Option.Option<number> =>
  Option.flatMap(Option.fromUndefinedOr(seedDigitsOf(part)), (digits) => Option.fromUndefinedOr(wholeNumberOf(digits)))

const decisionsIn = (part: string): Option.Option<ReadonlyArray<number>> =>
  Option.flatMap(
    Option.fromUndefinedOr(pathDigitsOf(part)),
    (entries) => Option.fromUndefinedOr(wholeNumbersOf(entriesOf(entries))),
  )

const pairPartsOf = (text: string): Option.Option<readonly [string, string]> => {
  const [seedPart, pathPart, ...rest] = text.split(PAIR_SEPARATOR)
  return rest.length === 0
    ? Option.all([Option.fromUndefinedOr(seedPart), Option.fromUndefinedOr(pathPart)])
    : Option.none()
}

/** The seed and decisions a pair names, or nothing when the pair is not `seed=…;path=…`. */
const namedPairOf = (text: string): Option.Option<readonly [number, ReadonlyArray<number>]> =>
  Option.flatMap(pairPartsOf(text), ([seedPart, pathPart]) => Option.all([seedIn(seedPart), decisionsIn(pathPart)]))

const replayOfName = (text: string): Option.Option<Replay> =>
  Option.flatMap(namedPairOf(text), ([seed, path]) => Schema.decodeOption(Replay)({ seed, path }))

const textOfEncodedReplay = (replay: EncodedReplay): string =>
  `${SEED_PREFIX}${replay.seed}${PAIR_SEPARATOR}${PATH_PREFIX}${replay.path.join(ENTRY_SEPARATOR)}`

const replayRefusal = (text: string): Error =>
  new Error(`CONFORMANCE_REPLAY names neither a seed nor a decision path: ${text}`)

/**
 * The `CONFORMANCE_REPLAY` text as the replay it names. A text a seed and a path cannot be read out of is refused
 * with the same prose the spec runtime has always thrown, so the grammar and its refusal share one home.
 *
 * @since 4.0.0
 */
export const replayOfText = (text: string): Replay =>
  Option.match(replayOfName(text), {
    onNone: () => {
      throw replayRefusal(text)
    },
    onSome: (replay) => replay,
  })

/** The text a replay is written as: the `CONFORMANCE_REPLAY` value a rerun line carries (R6).
 *
 * @since 4.0.0
 */
export const replayTextOf = (replay: Replay): string => textOfEncodedReplay(replay)

/**
 * The replay codec: `Schema.String` in, a replay out. A text that names no seed and path fails the decode, and
 * every replay encodes back to the text it was read from.
 *
 * @since 4.0.0
 */
export const ReplayFromText = Schema.String.pipe(
  Schema.decodeTo(Replay, {
    decode: SchemaGetter.transformEffect((text, options): Effect.Effect<EncodedReplay, SchemaIssue.Issue> =>
      Effect.fromOption(
        replayOfName(text),
        () => new SchemaIssue.InvalidValue({ message: NOT_A_REPLAY }, text, options),
      )
    ),
    encode: SchemaGetter.transform(textOfEncodedReplay),
  }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const acceptsSeed = (value: number): boolean => Option.isSome(Schema.decodeOption(ReplaySeed)(value))
  const acceptsStep = (value: number): boolean => Option.isSome(Schema.decodeOption(ReplayStep)(value))

  const agreesOn = (accepts: (value: number) => boolean, value: number): boolean =>
    accepts(value) === namesAWholeNumber(value)

  const agreesAtBoundaries = (accepts: (value: number) => boolean, value: number): boolean =>
    [value, ...REFUSED_REPLAY_NUMBERS].every((candidate) => agreesOn(accepts, candidate))

  it.prop(
    '∀n_ReplayRefusal_∈TheNamedNumbers',
    { of: [Schema.Int], subject: { accepts: acceptsSeed } },
    (seed, [value]) => and(agreesAtBoundaries(seed.accepts, value), agreesAtBoundaries(acceptsStep, value)),
  )
}
