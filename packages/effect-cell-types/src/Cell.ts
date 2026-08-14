import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'

/**
 * The type bag. Every phase's input and output type travels in one record so that a
 * stage's own type arguments are identical across stages, which leaves the sentence
 * member as the only difference a diagnostic can report. Measured: with the payload
 * carried per-stage instead, the compiler reports the mismatch at the argument (TS2345)
 * and the sentence arrives only as a type argument; with the payload in one bag it
 * reports the missing member (TS2741) and the sentence is that member's name.
 */
export interface Phases {
  readonly command: unknown
  readonly raw: unknown
  readonly decoded: unknown
  readonly decision: unknown
  readonly decisionError: unknown
  readonly output: unknown
  readonly response: unknown
  readonly decodeError: unknown
  readonly readError: unknown
  readonly writeError: unknown
  readonly readContext: unknown
  readonly writeContext: unknown
}

/**
 * A read gathers what the decision needs, and may gather a product across its interior;
 * that interior is not type-visible, so no I/O count is claimed or enforced here. A step that
 * mutates in order to report — bumping a counter and returning the resulting rate — is one
 * such product, and belongs here rather than in a layer of its own.
 */
export type ReadPhase<P extends Phases> = (
  command: P['command'],
) => Effect.Effect<P['raw'], P['readError'], P['readContext']>

/** Validation. Its `Left` is fatal: it reaches the derived error channel and no write runs. */
export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Either.Either<P['decoded'], P['decodeError']>

/** The decision. Its `Left` is an outcome, not a fault: both branches travel on to the write. */
export type DecidePhase<P extends Phases> = (
  decoded: P['decoded'],
) => Either.Either<P['decision'], P['decisionError']>

/** Shapes what the write consumes. Total, so it receives both branches of the decision. */
export type EncodePhase<P extends Phases> = (
  outcome: Either.Either<P['decision'], P['decisionError']>,
) => P['output']

export type WritePhase<P extends Phases> = (
  output: P['output'],
) => Effect.Effect<P['response'], P['writeError'], P['writeContext']>

/**
 * One impure/pure layer. Every phase slot is optional because a degenerate description is
 * legal — a single-phase description, or a query whose write is its own response — and the
 * stage brand, not the field's presence, is what proves which calls were made.
 *
 * Phases are keyed by name rather than carried as a tagged union: a union would need a
 * discriminant, and a hand-written `_tag` is forbidden here while a schema cannot describe
 * a function type. Keying by name removes the need to discriminate at all, and fixes the
 * intra-layer order so the interpreter reads phases in sequence instead of branching.
 */
export interface Layer<P extends Phases> {
  readonly read?: ReadPhase<P>
  readonly decode?: DecodePhase<P>
  readonly decide?: DecidePhase<P>
  readonly encode?: EncodePhase<P>
  readonly write?: WritePhase<P>
}

/**
 * The stages are siblings, never a hierarchy. Each carries exactly the sentence naming the
 * call that must come next, and none extends another. Measured: under a hierarchy a later
 * stage is assignable to an earlier parameter, so an inversion — decoding what was already
 * decided — compiles. As siblings both the forward skip and the backward inversion are
 * rejected, each diagnostic naming the sentence it is missing.
 *
 * The `layers` carrier is deliberately the same type on every stage. Vary it and the
 * compiler reports the argument rather than the member, and the sentence stops being a name.
 */
export interface ReadDone<P extends Phases> {
  readonly layers: ReadonlyArray<Layer<P>>
  readonly 'call read(command) before decode(raw)': true
}
export interface DecodeDone<P extends Phases> {
  readonly layers: ReadonlyArray<Layer<P>>
  readonly 'call decode(raw) before decide(decoded)': true
}
export interface DecideDone<P extends Phases> {
  readonly layers: ReadonlyArray<Layer<P>>
  readonly 'call decide(decoded) before encode(decision)': true
}
export interface EncodeDone<P extends Phases> {
  readonly layers: ReadonlyArray<Layer<P>>
  readonly 'call encode(decision) before write(output)': true
}
/** Terminal. A description is applied from here, and a further layer opens from here. */
export interface WriteDone<P extends Phases> {
  readonly layers: ReadonlyArray<Layer<P>>
  readonly 'call write(output) before applying the description': true
}

const READ_DONE = 'call read(command) before decode(raw)'
const DECODE_DONE = 'call decode(raw) before decide(decoded)'
const DECIDE_DONE = 'call decide(decoded) before encode(decision)'
const ENCODE_DONE = 'call encode(decision) before write(output)'
const WRITE_DONE = 'call write(output) before applying the description'

/** Replaces the open layer with itself plus one more phase. */
const intoOpenLayer = <P extends Phases>(
  layers: ReadonlyArray<Layer<P>>,
  phase: Layer<P>,
): ReadonlyArray<Layer<P>> => [
  ...layers.slice(0, -1),
  { ...layers[layers.length - 1], ...phase },
]

/**
 * Opens a layer. Passing a prior `WriteDone` opens a second layer over the same bag, so a
 * call site whose real order writes before it can classify is one description carrying two
 * layers rather than two descriptions composed by hand.
 *
 * This one is not dual: it starts the chain, so on the opening layer it has no `self` to
 * receive. Every phase after it is dual, which is what lets a description be written in the
 * order it runs.
 */
export const read = <P extends Phases>(run: ReadPhase<P>, previous?: WriteDone<P>): ReadDone<P> => ({
  [READ_DONE]: true,
  layers: [...(previous?.layers ?? []), { read: run }],
})

/**
 * The chaining phases are dual, data-last overload declared first. Nesting the constructors
 * reads innermost-first — backwards from the order the phases run — which defeats the point of
 * a type that exists to make that order legible. In `pipe` the call site reads in phase order,
 * and the sentence still arrives as a missing member through it.
 *
 * A `Do`-notation scope binding each phase's result for later phases to read was measured as
 * an alternative: the sentence survives it, even with the scope varying per stage, because an
 * absent member is reported before type arguments are compared. It was not adopted, because a
 * scope the interpreter folds over is type-erased, and reading a phase back out of it needs an
 * assertion this design does not.
 */
export const decode: {
  <P extends Phases>(run: DecodePhase<P>): (previous: ReadDone<P>) => DecodeDone<P>
  <P extends Phases>(previous: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P>
} = dual(2, <P extends Phases>(previous: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { decode: run }),
}))

export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (previous: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(previous: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({
  [DECIDE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { decide: run }),
}))

export const encode: {
  <P extends Phases>(run: EncodePhase<P>): (previous: DecideDone<P>) => EncodeDone<P>
  <P extends Phases>(previous: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P>
} = dual(2, <P extends Phases>(previous: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P> => ({
  [ENCODE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { encode: run }),
}))

export const write: {
  <P extends Phases>(run: WritePhase<P>): (previous: EncodeDone<P>) => WriteDone<P>
  <P extends Phases>(previous: EncodeDone<P>, run: WritePhase<P>): WriteDone<P>
} = dual(2, <P extends Phases>(previous: EncodeDone<P>, run: WritePhase<P>): WriteDone<P> => ({
  [WRITE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { write: run }),
}))

/**
 * Runs one layer as the sandwich it describes: impure read, pure filling, impure write.
 *
 * The two `Left` rules are carried by the phase types rather than chosen here. A `decode`
 * Left has no downstream consumer — nothing accepts `decodeError` — so its only route is a
 * failure, which is what puts it in the derived error channel. A `decide` Left cannot be
 * unwrapped, because `EncodePhase` takes the whole `Either`, so its only route is forward as
 * a value. Neither is a decision the interpreter makes.
 *
 * Every layer reachable from a `WriteDone` was built by the five constructors in order, so
 * every slot is filled. A layer that is nonetheless incomplete is a defect in this module,
 * never a domain outcome, so it dies. `dieMessage` returns `Effect<never>`, which is why the
 * guard costs the derived `E` and `R` nothing.
 */
const runLayer = <P extends Phases>(layer: Layer<P>, command: P['command']) =>
  Effect.gen(function*() {
    const { decide, decode, encode: shape, read, write: persist } = layer
    if (!read || !decode || !decide || !shape || !persist) {
      return yield* Effect.dieMessage(
        'effect-cell-types: a layer reached the interpreter with an unfilled phase slot',
      )
    }

    const raw = yield* read(command)
    const decoded = yield* Either.match(decode(raw), {
      onLeft: Effect.fail,
      onRight: Effect.succeed,
    })
    return yield* persist(shape(decide(decoded)))
  })

/**
 * Applies a description. The return type is deliberately not annotated: `gen` accumulates
 * `E` and `R` from the union of what is actually yielded, so an over-claimed channel is
 * unrepresentable rather than merely discouraged. Annotating it here would let this module
 * promise a failure that no phase can produce.
 *
 * The fold is a `reduce`, so the sequence is structural rather than an option a caller could
 * pass differently; the description's response is the last layer's. No scope is opened and
 * interruptibility is untouched, so a `Scope.Scope` a phase requires reaches the caller as
 * part of the derived `R`.
 */
export const apply = <P extends Phases>(description: WriteDone<P>, command: P['command']) =>
  Effect.gen(function*() {
    const last = yield* Effect.reduce(
      description.layers,
      Option.none<P['response']>(),
      (_previous, layer) => Effect.map(runLayer(layer, command), Option.some),
    )
    return yield* Option.match(last, {
      onNone: () => Effect.dieMessage('effect-cell-types: a description reached the interpreter with no layers'),
      onSome: Effect.succeed,
    })
  })
