/// <reference types="vitest/importMeta" />
/**
 * The one replay grammar (KTD10, KTD5, KD8, R6, R9-R12): the `CONFORMANCE_REPLAY` text a failure record's rerun
 * line carries and the engine reads back to re-run the same verdict. Two forms share it:
 *
 * - the kernel's schedule, `seed=<whole number>;path=<comma-separated whole numbers>` — the path is empty when the
 *   run took no decision (`seed=1;path=`);
 * - a property entry, `property=<identity hash>;seed=<whole number>;runs=<whole number>` for a run that was not
 *   refuted, and the same entry plus `;attempt=<n>;size=<n>;path=<comma-separated decisions>;failure=<tag>` for a
 *   refuted run, so the engine rebuilds the generator's replay token. Several entries are joined by `|`, which no
 *   entry can contain: every key is lowercase letters and every value is digits, commas or a failure tag.
 *
 * A text that names neither form is not a replay. The seed and every decision are branded whole numbers, and
 * the text is a codec rooted at `Schema.String`, so one declaration serves both the writer and the
 * reader instead of a pattern each.
 *
 * @since 4.0.0
 */
import { Effect, Match, Option, Schema, SchemaGetter, SchemaIssue } from 'effect'

/** The seed a replay names: the whole number a generator chose, never negative (CONST-D1). */
export const ReplaySeed = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('ReplaySeed'),
)
/** @since 4.0.0 */
export type ReplaySeed = typeof ReplaySeed.Type

/** One decision along a replay path: the index the scheduler picked at that step. */
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

/** A property's identity hash: the unsigned whole number `identityHash` derives from its identity (KTD4). */
export const PropertyHash = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('PropertyHash'),
)
/** @since 4.0.0 */
export type PropertyHash = typeof PropertyHash.Type

/** The count of runs a property entry names, never negative (CONST-D1). */
export const ReplayRunCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('ReplayRunCount'),
)
/** @since 4.0.0 */
export type ReplayRunCount = typeof ReplayRunCount.Type

/** The failure kind effect's falsification runner records in its replay token. */
export const ReplayFailureTag = Schema.Literals(['ReturnedFalse', 'PropertyError'])
/** @since 4.0.0 */
export type ReplayFailureTag = typeof ReplayFailureTag.Type

/**
 * A property entry for a run that was not refuted: the property's identity hash, the seed it ran with and its
 * run count (R9, R11).
 *
 * @since 4.0.0
 */
export const PlainPropertyReplay = Schema.TaggedStruct('Plain', {
  property: PropertyHash,
  seed: ReplaySeed,
  runs: ReplayRunCount,
})
/** @since 4.0.0 */
export type PlainPropertyReplay = typeof PlainPropertyReplay.Type

/**
 * A property entry for a refuted run: the plain fields, plus the generator replay token's parts the engine needs
 * to rebuild it — the attempt, the size, the shrink path and the failure tag (R9, R12, KTD5).
 *
 * @since 4.0.0
 */
export const RefutedPropertyReplay = Schema.TaggedStruct('Refuted', {
  property: PropertyHash,
  seed: ReplaySeed,
  runs: ReplayRunCount,
  attempt: ReplayRunCount,
  size: ReplayRunCount,
  path: Schema.Array(ReplayStep),
  failure: ReplayFailureTag,
})
/** @since 4.0.0 */
export type RefutedPropertyReplay = typeof RefutedPropertyReplay.Type

/** One property entry: a plain run, or a refuted one (R9). */
export const PropertyReplay = Schema.Union([RefutedPropertyReplay, PlainPropertyReplay])
/** @since 4.0.0 */
export type PropertyReplay = typeof PropertyReplay.Type

/** What a `CONFORMANCE_REPLAY` text names: the kernel's replay, or one or more property entries (KTD5). */
export const ReplayChannel = Schema.Union([Replay, Schema.Array(PropertyReplay)])
/** @since 4.0.0 */
export type ReplayChannel = typeof ReplayChannel.Type

/** The fields a plain property entry's text interpolates. */
export interface PlainReplayFields {
  readonly property: number
  readonly seed: number
  readonly runs: number
}

/** The fields a refuted property entry's text interpolates, the plain fields plus the generator token's parts. */
export interface RefutedReplayFields extends PlainReplayFields {
  readonly attempt: number
  readonly size: number
  readonly path: ReadonlyArray<number>
  readonly failure: string
}

/** Several plain entries, for the vacuous verdict's replay text (R11). */
export type PlainReplayFieldsList = ReadonlyArray<PlainReplayFields>

type EncodedReplay = typeof Replay.Encoded

const SEED_PREFIX = 'seed='
const PATH_PREFIX = 'path='
const PROPERTY_PREFIX = 'property='
const RUNS_PREFIX = 'runs='
const ATTEMPT_PREFIX = 'attempt='
const SIZE_PREFIX = 'size='
const FAILURE_PREFIX = 'failure='
const PAIR_SEPARATOR = ';'
const LIST_SEPARATOR = ','
const ENTRY_SEPARATOR = '|'
const WHOLE_NUMBER = /^\d+$/u
const ASSIGNMENT = /^([a-z]+)=([\s\S]*)$/u

const NOT_A_REPLAY = 'a replay reads "seed=<whole number>;path=<comma-separated whole numbers>"'
const NOT_A_CHANNEL =
  'a replay reads "seed=<whole number>;path=<whole numbers>", or one or more "property=<hash>;seed=<n>;runs=<n>"' +
  ' entries joined by "|"'

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

const entriesOf = (text: string): ReadonlyArray<string> => text.length === 0 ? [] : text.split(LIST_SEPARATOR)

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

const exactlyTwoParts = (parts: ReadonlyArray<string>): boolean => parts.length === 2

const pairPartsOf = (text: string): Option.Option<readonly [string, string]> => {
  const parts = text.split(PAIR_SEPARATOR)
  return exactlyTwoParts(parts)
    ? Option.all([Option.fromUndefinedOr(parts[0]), Option.fromUndefinedOr(parts[1])])
    : Option.none()
}

/** The seed and decisions a pair names, or nothing when the pair is not `seed=…;path=…`. */
const namedPairOf = (text: string): Option.Option<readonly [number, ReadonlyArray<number>]> =>
  Option.flatMap(pairPartsOf(text), ([seedPart, pathPart]) => Option.all([seedIn(seedPart), decisionsIn(pathPart)]))

/** The replay a seed and decision path name, or nothing when either is outside the grammar's domain. */
export const replayOfParts = (parts: EncodedReplay): Option.Option<Replay> => Schema.decodeOption(Replay)(parts)

const replayOfName = (text: string): Option.Option<Replay> =>
  Option.flatMap(namedPairOf(text), ([seed, path]) => replayOfParts({ seed, path }))

const textOfEncodedReplay = (replay: EncodedReplay): string =>
  `${SEED_PREFIX}${replay.seed}${PAIR_SEPARATOR}${PATH_PREFIX}${replay.path.join(LIST_SEPARATOR)}`

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

/** One `key=value` a property entry names. */
type Field = readonly [string, string]

const fieldOfPart = (part: string): Option.Option<Field> =>
  Option.flatMap(
    Option.fromNullishOr(ASSIGNMENT.exec(part)),
    (matched) =>
      Option.map(
        Option.all([Option.fromUndefinedOr(matched[1]), Option.fromUndefinedOr(matched[2])]),
        ([key, value]) => [key, value] as const,
      ),
  )

const fieldsOf = (text: string): Option.Option<ReadonlyArray<Field>> =>
  Option.all(text.split(PAIR_SEPARATOR).map(fieldOfPart))

const textIn = (fields: ReadonlyArray<Field>, key: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(fields.find(([name]) => name === key)), (field) => field[1])

/** The entry's keys name exactly `keys`, in order — so a reordered or repeated field is refused (KD8). */
const keysAre = (fields: ReadonlyArray<Field>, keys: ReadonlyArray<string>): boolean =>
  fields.length === keys.length && fields.every(([name], at) => name === keys[at])

const naturalIn = (fields: ReadonlyArray<Field>, key: string): Option.Option<number> =>
  Option.flatMap(textIn(fields, key), (text) => Option.fromUndefinedOr(wholeNumberOf(text)))

const pathIn = (fields: ReadonlyArray<Field>, key: string): Option.Option<ReadonlyArray<number>> =>
  Option.flatMap(textIn(fields, key), (text) => Option.fromUndefinedOr(wholeNumbersOf(entriesOf(text))))

const failureIn = (fields: ReadonlyArray<Field>, key: string): Option.Option<ReplayFailureTag> =>
  Option.flatMap(textIn(fields, key), (text) => Schema.decodeUnknownOption(ReplayFailureTag)(text))

const PLAIN_KEYS: ReadonlyArray<string> = ['property', 'seed', 'runs']
const REFUTED_KEYS: ReadonlyArray<string> = ['property', 'seed', 'runs', 'attempt', 'size', 'path', 'failure']

const plainEncodedOf = (fields: ReadonlyArray<Field>): Option.Option<typeof PlainPropertyReplay.Encoded> =>
  Option.map(
    Option.all([naturalIn(fields, 'property'), naturalIn(fields, 'seed'), naturalIn(fields, 'runs')]),
    ([property, seed, runs]) => ({ _tag: 'Plain' as const, property, seed, runs }),
  )

const refutedEncodedOf = (fields: ReadonlyArray<Field>): Option.Option<typeof RefutedPropertyReplay.Encoded> =>
  Option.map(
    Option.all([
      naturalIn(fields, 'property'),
      naturalIn(fields, 'seed'),
      naturalIn(fields, 'runs'),
      naturalIn(fields, 'attempt'),
      naturalIn(fields, 'size'),
      pathIn(fields, 'path'),
      failureIn(fields, 'failure'),
    ]),
    ([property, seed, runs, attempt, size, path, failure]) => ({
      _tag: 'Refuted' as const,
      property,
      seed,
      runs,
      attempt,
      size,
      path,
      failure,
    }),
  )

const plainEntryOf = (fields: ReadonlyArray<Field>): Option.Option<PropertyReplay> =>
  Option.flatMap(plainEncodedOf(fields), (encoded) => Schema.decodeOption(PlainPropertyReplay)(encoded))

const refutedEntryOf = (fields: ReadonlyArray<Field>): Option.Option<PropertyReplay> =>
  Option.flatMap(refutedEncodedOf(fields), (encoded) => Schema.decodeOption(RefutedPropertyReplay)(encoded))

const plainWhenKeysOf = (fields: ReadonlyArray<Field>): Option.Option<PropertyReplay> =>
  keysAre(fields, PLAIN_KEYS) ? plainEntryOf(fields) : Option.none()

const refutedWhenKeysOf = (fields: ReadonlyArray<Field>): Option.Option<PropertyReplay> =>
  keysAre(fields, REFUTED_KEYS) ? refutedEntryOf(fields) : Option.none()

const propertyEntryOf = (text: string): Option.Option<PropertyReplay> =>
  Option.flatMap(
    fieldsOf(text),
    (fields) => Option.orElse(plainWhenKeysOf(fields), () => refutedWhenKeysOf(fields)),
  )

const propertyChannelOf = (text: string): Option.Option<ReadonlyArray<PropertyReplay>> =>
  text.length === 0 ? Option.none() : Option.all(text.split(ENTRY_SEPARATOR).map(propertyEntryOf))

const channelOfName = (text: string): Option.Option<ReplayChannel> =>
  Option.match(replayOfName(text), {
    onNone: () => propertyChannelOf(text),
    onSome: (replay) => Option.some(replay),
  })

type EncodedChannel = typeof ReplayChannel.Encoded
type EncodedPropertyReplay = typeof PropertyReplay.Encoded

const isEntries = (channel: EncodedChannel): channel is ReadonlyArray<EncodedPropertyReplay> => Array.isArray(channel)

/** The text a plain property entry is written as (R9, R11). */
export const plainReplayText = (fields: PlainReplayFields): string =>
  `${PROPERTY_PREFIX}${fields.property}${PAIR_SEPARATOR}${SEED_PREFIX}${fields.seed}${PAIR_SEPARATOR}` +
  `${RUNS_PREFIX}${fields.runs}`

/** The text several plain entries are written as, joined by `|` (R11). */
export const plainReplayTexts = (entries: PlainReplayFieldsList): string =>
  entries.map(plainReplayText).join(ENTRY_SEPARATOR)

/** The text a refuted property entry is written as (R9, R12). */
export const refutedReplayText = (fields: RefutedReplayFields): string =>
  `${plainReplayText(fields)}${PAIR_SEPARATOR}${ATTEMPT_PREFIX}${fields.attempt}${PAIR_SEPARATOR}${SIZE_PREFIX}` +
  `${fields.size}${PAIR_SEPARATOR}${PATH_PREFIX}${fields.path.join(LIST_SEPARATOR)}${PAIR_SEPARATOR}` +
  `${FAILURE_PREFIX}${fields.failure}`

const entryTextOf = (entry: EncodedPropertyReplay): string =>
  Match.value(entry).pipe(
    Match.tag('Refuted', (refuted) => refutedReplayText(refuted)),
    Match.tag('Plain', (plain) => plainReplayText(plain)),
    Match.exhaustive,
  )

/** The text a channel is written as: the kernel's replay, or the entries joined by `|` (KTD5). */
export const replayChannelTextOf = (channel: EncodedChannel): string =>
  isEntries(channel) ? channel.map(entryTextOf).join(ENTRY_SEPARATOR) : textOfEncodedReplay(channel)

/**
 * The refusal predicate, written from the grammar rather than the codec: the exact texts each form admits. The
 * in-source law checks it against the codec so neither can drift from the grammar silently.
 */
const KERNEL_TEXT = /^seed=\d+;path=(?:\d+(?:,\d+)*)?$/u
const PLAIN_ENTRY_TEXT = /^property=\d+;seed=\d+;runs=\d+$/u
const REFUTED_ENTRY_TEXT =
  /^property=\d+;seed=\d+;runs=\d+;attempt=\d+;size=\d+;path=(?:\d+(?:,\d+)*)?;failure=(?:ReturnedFalse|PropertyError)$/u

const isEntryText = (text: string): boolean => PLAIN_ENTRY_TEXT.test(text) || REFUTED_ENTRY_TEXT.test(text)

const allEntriesAreText = (text: string): boolean => text.length > 0 && text.split(ENTRY_SEPARATOR).every(isEntryText)

const namesAReplayChannel = (text: string): boolean => KERNEL_TEXT.test(text) || allEntriesAreText(text)

/**
 * The kernel's replay codec: `Schema.String` in, a replay out. A text that names no seed and path fails the decode,
 * and every replay encodes back to the text it was read from.
 *
 * @since 4.0.0
 */
export const ReplayFromText = Schema.String.pipe(
  Schema.decodeTo(Replay, {
    decode: SchemaGetter.transformEffect((text, options): Effect.Effect<Replay, SchemaIssue.Issue> =>
      Effect.fromOption(
        replayOfName(text),
        () => new SchemaIssue.InvalidValue({ message: NOT_A_REPLAY }, text, options),
      )
    ),
    encode: SchemaGetter.transform(textOfEncodedReplay),
  }),
)

/**
 * The channel codec: `Schema.String` in, the kernel's replay or the property entries out. A text that names neither
 * form fails the decode, and every channel encodes back to the text it was read from.
 *
 * @since 4.0.0
 */
export const ReplayChannelFromText = Schema.String.pipe(
  Schema.decodeTo(ReplayChannel, {
    decode: SchemaGetter.transformEffect((text, options): Effect.Effect<EncodedChannel, SchemaIssue.Issue> =>
      Effect.fromOption(
        channelOfName(text),
        () => new SchemaIssue.InvalidValue({ message: NOT_A_CHANNEL }, text, options),
      )
    ),
    encode: SchemaGetter.transform((channel: EncodedChannel): string => replayChannelTextOf(channel)),
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

  const PlainFields = Schema.Struct({
    property: Schema.Natural,
    seed: Schema.Natural,
    runs: Schema.Natural,
  })

  const RefutedFields = Schema.Struct({
    property: Schema.Natural,
    seed: Schema.Natural,
    runs: Schema.Natural,
    attempt: Schema.Natural,
    size: Schema.Natural,
    path: Schema.Array(Schema.Natural),
    failure: ReplayFailureTag,
  })

  const decodeChannel = (text: string): Option.Option<ReplayChannel> => Schema.decodeOption(ReplayChannelFromText)(text)
  const acceptsChannel = (text: string): boolean => Option.isSome(channelOfName(text))

  type EncodedPlain = typeof PlainPropertyReplay.Encoded
  type EncodedRefuted = typeof RefutedPropertyReplay.Encoded

  const firstEntryOf = (channel: EncodedChannel): EncodedPropertyReplay | undefined =>
    isEntries(channel) ? channel[0] : undefined

  const pathMatches = (actual: ReadonlyArray<number>, expected: ReadonlyArray<number>): boolean =>
    actual.length === expected.length && actual.every((step, at) => step === expected[at])

  const plainFieldsMatch = (entry: EncodedPlain, fields: PlainReplayFields): boolean =>
    [entry.property === fields.property, entry.seed === fields.seed, entry.runs === fields.runs].every(Boolean)

  const refutedFieldsMatch = (entry: EncodedRefuted, fields: RefutedReplayFields): boolean =>
    [
      entry.property === fields.property,
      entry.seed === fields.seed,
      entry.runs === fields.runs,
      entry.attempt === fields.attempt,
      entry.size === fields.size,
      pathMatches(entry.path, fields.path),
      entry.failure === fields.failure,
    ].every(Boolean)

  const entryReadsBack = (entry: EncodedPropertyReplay, text: string): boolean => replayChannelTextOf([entry]) === text

  const plainEntryReadsBack = (entry: EncodedPropertyReplay, fields: PlainReplayFields, text: string): boolean =>
    Match.value(entry).pipe(
      Match.tag('Plain', (plain) => plainFieldsMatch(plain, fields) && entryReadsBack(plain, text)),
      Match.tag('Refuted', () => false),
      Match.exhaustive,
    )

  const refutedEntryReadsBack = (entry: EncodedPropertyReplay, fields: RefutedReplayFields, text: string): boolean =>
    Match.value(entry).pipe(
      Match.tag('Refuted', (refuted) => refutedFieldsMatch(refuted, fields) && entryReadsBack(refuted, text)),
      Match.tag('Plain', () => false),
      Match.exhaustive,
    )

  const plainChannelReadsBack = (channel: EncodedChannel, fields: PlainReplayFields, text: string): boolean => {
    const entry = firstEntryOf(channel)
    return entry !== undefined && plainEntryReadsBack(entry, fields, text)
  }

  const refutedChannelReadsBack = (channel: EncodedChannel, fields: RefutedReplayFields, text: string): boolean => {
    const entry = firstEntryOf(channel)
    return entry !== undefined && refutedEntryReadsBack(entry, fields, text)
  }

  it.prop(
    '∀fields_PlainEntry_≡ItsOwnText',
    { of: [PlainFields], subject: { decode: decodeChannel } },
    (grammar, [fields]) => {
      const text = plainReplayText(fields)
      return Option.match(grammar.decode(text), {
        onNone: () => false,
        onSome: (channel) => plainChannelReadsBack(channel, fields, text),
      })
    },
  )

  it.prop(
    '∀fields_RefutedEntry_≡ItsOwnText',
    { of: [RefutedFields], subject: { decode: decodeChannel } },
    (grammar, [fields]) => {
      const text = refutedReplayText(fields)
      return Option.match(grammar.decode(text), {
        onNone: () => false,
        onSome: (channel) => refutedChannelReadsBack(channel, fields, text),
      })
    },
  )

  const MALFORMED_REPLAY_TEXTS: ReadonlyArray<string> = [
    '',
    'foo',
    'seed=7',
    'seed=7;path=1|',
    'property=;seed=1;runs=1',
    'property=1;seed=1',
    'property=1;seed=1;runs=1;attempt=1',
    'property=1;seed=1;runs=1;attempt=1;size=1;path=1',
    'property=1;seed=1;runs=1;attempt=1;size=1;path=1;failure=Nope',
    'seed=1;property=2;runs=3',
    'seed=7;path=1|property=1;seed=1;runs=1',
  ]

  const VALID_REPLAY_TEXTS: ReadonlyArray<string> = [
    'seed=7;path=1,2,3',
    'seed=1;path=',
    'property=1;seed=2;runs=3',
    'property=9;seed=2;runs=3;attempt=0;size=5;path=1,2;failure=ReturnedFalse',
  ]

  const BoundaryText = Schema.Union(
    [...MALFORMED_REPLAY_TEXTS, ...VALID_REPLAY_TEXTS].map((text) => Schema.Literal(text)),
  )

  it.prop(
    '∀t_ReplayChannelRefusal_≡TheNamedGrammar',
    { of: [Schema.Tuple([Schema.String, BoundaryText])], subject: { accepts: acceptsChannel } },
    (grammar, [[text, boundary]]) =>
      (grammar.accepts(text) === namesAReplayChannel(text)) &&
      (grammar.accepts(boundary) === namesAReplayChannel(boundary)),
  )
}
