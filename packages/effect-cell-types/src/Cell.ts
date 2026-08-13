import type { Effect } from 'effect/Effect'
import type { Either } from 'effect/Either'

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
 * that interior is not type-visible, so no I/O count is claimed or enforced here.
 */
export type ReadPhase<P extends Phases> = (
  command: P['command'],
) => Effect<P['raw'], P['readError'], P['readContext']>

/** Validation. Its `Left` is fatal: it reaches the derived error channel and no write runs. */
export type DecodePhase<P extends Phases> = (raw: P['raw']) => Either<P['decoded'], P['decodeError']>

/** The decision. Its `Left` is an outcome, not a fault: both branches travel on to the write. */
export type DecidePhase<P extends Phases> = (
  decoded: P['decoded'],
) => Either<P['decision'], P['decisionError']>

/** Shapes what the write consumes. Total, so it receives both branches of the decision. */
export type EncodePhase<P extends Phases> = (
  outcome: Either<P['decision'], P['decisionError']>,
) => P['output']

export type WritePhase<P extends Phases> = (
  output: P['output'],
) => Effect<P['response'], P['writeError'], P['writeContext']>

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
 */
export const read = <P extends Phases>(run: ReadPhase<P>, previous?: WriteDone<P>): ReadDone<P> => ({
  [READ_DONE]: true,
  layers: [...(previous?.layers ?? []), { read: run }],
})

export const decode = <P extends Phases>(
  previous: ReadDone<P>,
  run: DecodePhase<P>,
): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { decode: run }),
})

export const decide = <P extends Phases>(
  previous: DecodeDone<P>,
  run: DecidePhase<P>,
): DecideDone<P> => ({
  [DECIDE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { decide: run }),
})

export const encode = <P extends Phases>(
  previous: DecideDone<P>,
  run: EncodePhase<P>,
): EncodeDone<P> => ({
  [ENCODE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { encode: run }),
})

export const write = <P extends Phases>(
  previous: EncodeDone<P>,
  run: WritePhase<P>,
): WriteDone<P> => ({
  [WRITE_DONE]: true,
  layers: intoOpenLayer(previous.layers, { write: run }),
})
