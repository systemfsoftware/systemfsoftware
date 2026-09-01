import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import { CanonicalCommand, canonicalDecide } from './CanonicalDecide.workflow.js'
import { type WorkflowBrand } from './Workflow.js'
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
}

/**
 * A read gathers what the decision needs, and may gather a product across its interior;
 * that interior is not type-visible, so no I/O count is claimed or enforced here. A step that
 * mutates in order to report — bumping a counter and returning the resulting rate — is one
 * such product, and belongs here rather than in a sandwich of its own.
 *
 * The context channel is pinned `never`: a phase requires nothing. Services are resolved by
 * whoever builds the description and handed to the phase as ordinary parameters, which is
 * the same edge that already gathers the read's inputs. The alternative — a `readContext`
 * member on the bag — let an author write `never` for a body that reaches for a service, and
 * nothing checked the claim: under a stage generic over `Phases` the compiler cannot see the
 * lambda's requirement at all, so the description compiled and the missing service surfaced
 * only where it was finally applied, or nowhere. Pinning it makes the lie unrepresentable
 * instead of merely discouraged, and leaves `apply`'s derived `R` honestly `never`.
 */
export type ReadPhase<P extends Phases> = (
  command: P['command'],
) => Effect.Effect<P['raw'], P['readError'], never>

/** Validation. Its `Left` is fatal: it reaches the derived error channel and no write runs. */
export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Result.Result<P['decoded'], P['decodeError']>

/**
 * The decision. Its `Left` is an outcome, not a fault: both branches travel on to the write.
 *
 * The {@link WorkflowBrand} conjunct makes this the one surface a decision must cross
 * branded: only a `Workflow.make` value satisfies it, so a bare lambda handed here is
 * refused by the compiler with the brand conjunct named in the diagnostic. The `run` on
 * a `DecideNode` inherits the conjunct through this type, which keeps the interpreter's
 * fold sound — a description can only carry decisions that came through `make`.
 */
export type DecidePhase<P extends Phases> =
  & ((
    decoded: P['decoded'],
  ) => Result.Result<P['decision'], P['decisionError']>)
  & WorkflowBrand

/** Shapes what the write consumes. Total, so it receives both branches of the decision. */
export type EncodePhase<P extends Phases> = (
  outcome: Result.Result<P['decision'], P['decisionError']>,
) => P['output']

/**
 * The write. It receives the encoded `output` and, as a second argument, the `raw` its own
 * sandwich's read gathered.
 *
 * `raw` is there because a write is frequently the point that persists or reports what the
 * read found, while the decision in between deliberately narrows to what it needed. Without
 * this argument such a write has no channel for it and the description smuggles the value
 * through a closure — a `let` beside the description, assigned in the read and consulted in
 * the write, which then needs a runtime guard for a value the fold has already produced. The
 * argument is second, and a write that does not want it declares one parameter: a unary
 * function satisfies this type, so every write written before it existed is unchanged.
 */
export type WritePhase<P extends Phases> = (
  output: P['output'],
  raw: P['raw'],
) => Effect.Effect<P['response'], P['writeError'], never>

// ---------------------------------------------------------------------------
// the phase records — the description value is an ordered sequence of these
// ---------------------------------------------------------------------------

/**
 * The invocation shape a folding consumer must use to call a phase's `run`:
 * - `'effect'` — `run` returns an `Effect`; yield it. (read, write)
 * - `'either-fail'` — `run` returns a `Result` whose `Failure` is fatal; fail on `Failure`. (decode)
 * - `'either-pass'` — `run` returns a `Result` that travels forward whole. (decide)
 * - `'total'` — `run` is a plain total function; call it directly. (encode)
 *
 * This is structural data on the record, not one of the five axes: it lets an executing
 * consumer fold the description without knowing which phase it is looking at. The
 * interpreter's switch over `convention` is exhaustively defaulted, so a phase with an
 * invocation shape this module does not know fails at compile time at one named location.
 */
export type Convention = 'effect' | 'either-fail' | 'either-pass' | 'total'

/**
 * One phase record: `name` (the phase name, as data), `kind` (purity), `convention`
 * (the invocation shape), and the phase's `run`. Each phase type has its own record
 * interface so `run` keeps its exact signature. Nothing here discriminates on `name`:
 * the interpreter dispatches on `convention`, and other consumers read `name` as data.
 * A hand-written `_tag` is deliberately absent — a manual `_tag` member is forbidden
 * here (the schema rule prescribes `TaggedStruct`, which cannot describe a function
 * member), and an ordered sequence of phase records is not a `Match`-style tagged union.
 */
export interface ReadNode<P extends Phases> {
  readonly name: 'read'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: ReadPhase<P>
}
export interface DecodeNode<P extends Phases> {
  readonly name: 'decode'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
  readonly run: DecodePhase<P>
}
export interface DecideNode<P extends Phases> {
  readonly name: 'decide'
  readonly kind: 'pure'
  readonly convention: 'either-pass'
  readonly run: DecidePhase<P>
}
export interface EncodeNode<P extends Phases> {
  readonly name: 'encode'
  readonly kind: 'pure'
  readonly convention: 'total'
  readonly run: EncodePhase<P>
}
export interface WriteNode<P extends Phases> {
  readonly name: 'write'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: WritePhase<P>
}

export type Phase<P extends Phases> =
  | ReadNode<P>
  | DecodeNode<P>
  | DecideNode<P>
  | EncodeNode<P>
  | WriteNode<P>

/** The description package's own module name — what an import edge would match. */
export const DESCRIPTION_MODULE = '@systemfsoftware/effect-cell-types' as const

/**
 * The I/O-cell classification: the cells whose calls are I/O, plus the non-cell module
 * sources whose calls are I/O. Written once here; a consumer folds it off the value.
 */
export const IO_CELLS = {
  cells: ['store', 'adapter'],
  sources: ['effect/Clock', 'effect/System'],
} as const

/**
 * Derived from the value rather than restated beside it: a hand-written twin is a second
 * declaration of axis 5, and the two drift the moment a cell is reclassified in only one.
 */
export type IoCellClassification = typeof IO_CELLS

/**
 * The description root, carried by every stage. A description is one sandwich — read,
 * decode, decide, encode, write — and its `phases` array is that sandwich in execution
 * order. A consumer folds a stage value to recover the description's whole vocabulary:
 * the phase names and kinds on each record, the order of the `phases` array, the
 * package's own module name, and the I/O-cell classification. Nothing about the shape of
 * a legal description is written down anywhere else.
 *
 * Composing two sandwiches — a write whose result a later read must see, a response that
 * becomes the next command — is the calling `Effect.gen`'s job: bind one `apply`'s
 * response, derive the next command, `apply` again. A description never carries that
 * sequencing itself.
 */
export interface Description<P extends Phases> {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly phases: readonly Phase<P>[]
}

/**
 * The stages are siblings, never a hierarchy. Each carries exactly the sentence naming the
 * call that must come next, and none extends another. Measured: under a hierarchy a later
 * stage is assignable to an earlier parameter, so an inversion — decoding what was already
 * decided — compiles. As siblings both the forward skip and the backward inversion are
 * rejected, each diagnostic naming the sentence it is missing.
 *
 * The carrier is deliberately the same type on every stage — `Description` — so the
 * compiler reports the argument rather than the member only when the carrier itself is
 * wrong, and the sentence stays the name a diagnostic reports.
 */
export interface ReadDone<P extends Phases> extends Description<P> {
  readonly 'call read(command) before decode(raw)': true
}
export interface DecodeDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
export interface DecideDone<P extends Phases> extends Description<P> {
  readonly 'call decide(decoded) before encode(decision)': true
}
export interface EncodeDone<P extends Phases> extends Description<P> {
  readonly 'call encode(decision) before write(output)': true
}
/** Terminal. A description is applied from here. */
export interface WriteDone<P extends Phases> extends Description<P> {
  readonly 'call write(output) before applying the description': true
}

const READ_DONE = 'call read(command) before decode(raw)'
const DECODE_DONE = 'call decode(raw) before decide(decoded)'
const DECIDE_DONE = 'call decide(decoded) before encode(decision)'
const ENCODE_DONE = 'call encode(decision) before write(output)'
const WRITE_DONE = 'call write(output) before applying the description'

/**
 * Opens the description. This one is not dual: it starts the chain, so it has no `self`
 * to receive. Every phase after it is dual, which is what lets a description be written
 * in the order it runs.
 */
export const read = <P extends Phases>(run: ReadPhase<P>): ReadDone<P> => ({
  [READ_DONE]: true,
  module: DESCRIPTION_MODULE,
  ioCells: IO_CELLS,
  phases: [{ name: 'read', kind: 'impure', convention: 'effect', run }],
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
  <P extends Phases>(run: DecodePhase<P>): (self: ReadDone<P>) => DecodeDone<P>
  <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P>
} = dual(2, <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decode', kind: 'pure', convention: 'either-fail', run }],
}))

export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (self: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({
  [DECIDE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decide', kind: 'pure', convention: 'either-pass', run }],
}))

export const encode: {
  <P extends Phases>(run: EncodePhase<P>): (self: DecideDone<P>) => EncodeDone<P>
  <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P>
} = dual(2, <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P> => ({
  [ENCODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'encode', kind: 'pure', convention: 'total', run }],
}))

export const write: {
  <P extends Phases>(run: WritePhase<P>): (self: EncodeDone<P>) => WriteDone<P>
  <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P>
} = dual(2, <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P> => ({
  [WRITE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'write', kind: 'impure', convention: 'effect', run }],
}))

/**
 * What can flow through the interpreter's fold: every phase's input and output type,
 * including the `decide` `Result` that travels forward whole. The value is threaded as
 * this union rather than `unknown` so each phase call is sound without an assertion —
 * every member is an indexed access on `Phases` (constrained `unknown`), and the only
 * constructed member, the outcome `Result`, is narrowed by a runtime guard. The phase
 * input types are not observable, so no narrower claim is possible here.
 */
type FoldValue<P extends Phases> =
  | P['command']
  | P['raw']
  | P['decoded']
  | Result.Result<P['decision'], P['decisionError']>
  | P['output']
  | P['response']

/**
 * The runtime guard that lets the `'total'` case call `EncodePhase` soundly: an encode
 * phase is chained only after a decide, so the value reaching it is the outcome `Result`
 * and `Result.isResult` certifies exactly that. The specific `decision`/`decisionError`
 * members are not observable at runtime, so the guard narrows to them by construction —
 * the same trust the fold places in the chain's order.
 */
const isOutcome = <P extends Phases>(
  value: FoldValue<P>,
): value is Result.Result<P['decision'], P['decisionError']> => Result.isResult(value)

/**
 * Applies a description: runs its one sandwich as the value declares, each phase record
 * dispatched on its carried `convention`, in `phases` array order. There is no phase
 * sequence held beside the value — the description's declared order IS its execution
 * order. The convention switch is exhaustive over the union via its `never` default: a
 * future phase with an invocation shape this module does not know fails at compile time,
 * at this one location.
 *
 * The two `Failure` rules are carried by the phase types rather than chosen here. A `decode`
 * Failure has no downstream consumer — nothing accepts `decodeError` — so its only route is a
 * failure, which is what puts it in the derived error channel. A `decide` Failure cannot be
 * unwrapped, because `EncodePhase` takes the whole `Result`, so its only route is forward as
 * a value. Neither is a decision the interpreter makes.
 *
 * The return type is deliberately not annotated: `gen` accumulates `E` and `R` from the
 * union of what is actually yielded, so an over-claimed channel is unrepresentable rather
 * than merely discouraged. Annotating it here would let this module promise a failure that
 * no phase can produce.
 *
 * The parameter keeps the terminal `WriteDone<P>` brand. It is not decoration: it is what
 * makes applying a half-built chain — a `ReadDone`, say — a compile error rather than a
 * runtime death, which `test-types/Cell.tst.ts` pins. The brand does not constrain the
 * phases array's order (a literal satisfies it in any order, which is why the interpreter
 * reads the order off the value), but it does constrain chain completion, and that is a
 * guarantee worth the narrower parameter.
 *
 * Every description reachable from a `WriteDone` was built by the five constructors in
 * order, so its last phase is a write and every slot is filled. A description that is
 * nonetheless empty or not closed by a write is a defect in this module, never a domain
 * outcome, so it dies — `Effect.die` returns `Effect<never>`, which is why the guards
 * cost the derived `E` and `R` nothing. The response is the write's. No scope is opened
 * and interruptibility is untouched, so a `Scope.Scope` a phase requires reaches the
 * caller as part of the derived `R`.
 */
export const apply = <P extends Phases>(description: WriteDone<P>, command: P['command']) =>
  Effect.gen(function*() {
    const phases = description.phases
    const last = phases[phases.length - 1]
    if (!last || last.name !== 'write') {
      return yield* Effect.die(
        new Error('effect-cell-types: a description reached the interpreter without a write phase closing it'),
      )
    }

    let value: FoldValue<P> = command
    // What the read gathered, kept so the terminal write receives it as well as the
    // encoded output. Before a read has run there is nothing gathered and the command is
    // the only thing the description has seen, which is what a read-less description's
    // write is handed.
    let raw: FoldValue<P> = command
    for (const phase of phases.slice(0, -1)) {
      switch (phase.convention) {
        case 'effect':
          // `effect` covers both impure phases and their arities differ, so the branch
          // narrows on the phase name rather than calling through the union.
          if (phase.name === 'read') {
            value = yield* phase.run(value)
            raw = value
            break
          }
          value = yield* phase.run(value, raw)
          break
        case 'either-fail':
          value = yield* Result.match(phase.run(value), {
            onFailure: Effect.fail,
            onSuccess: Effect.succeed,
          })
          break
        case 'either-pass':
          value = phase.run(value)
          break
        case 'total': {
          if (!isOutcome(value)) {
            return yield* Effect.die(
              new Error(
                'effect-cell-types: an encode phase received a value that is not the decide outcome',
              ),
            )
          }
          value = phase.run(value)
          break
        }
        default: {
          const unreachable: never = phase
          return yield* Effect.die(
            new Error(`effect-cell-types: unknown phase convention ${String(unreachable)}`),
          )
        }
      }
    }
    // The guard above certified that the last phase is a write; yielding its effect
    // directly is what makes the derived success channel the description's `response` —
    // the fold's loop cannot see that, so the terminal write is peeled out of it.
    return yield* last.run(value, raw)
  })

// ---------------------------------------------------------------------------
// the vocabulary — derived by folding a canonical description, not declared twice
// ---------------------------------------------------------------------------

/** One phase's vocabulary entry: what it is called, its purity, its invocation shape. */
export interface PhaseFact {
  readonly name: Phase<Phases>['name']
  readonly kind: Phase<Phases>['kind']
  readonly convention: Convention
}

/**
 * The five axes as data, for a consumer that has no description of its own to fold.
 *
 * `byKind` groups the walked phase names by their purity. It is here rather than left to
 * each consumer because which phases are pure is this module's own fact, and a consumer
 * that reconstructs it has to pick a proxy — inferring purity from the invocation shape,
 * say — which is a different axis and silently disagrees the moment a pure phase is given
 * an effectful shape or an impure one is not.
 */
export interface Vocabulary {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly phases: readonly PhaseFact[]
  readonly byKind: Readonly<Record<PhaseFact['kind'], readonly PhaseFact['name'][]>>
  /**
   * The export that runs a finished description. A consumer deciding which calls on this module
   * belong to a description needs the phases *and* the applier; without it the applier is the one
   * name it has to write down for itself, and one restated name is enough to drift.
   */
  readonly applier: 'apply'
}

/**
 * The bag the canonical description is built with. It is `Phases` with one member
 * pinned: `decoded` is the canonical command class, because `canonicalDecide` is a
 * decider over that class and a decider's parameter is contravariant — a phase typed
 * `(decoded: unknown) => …` would demand that `unknown` be assignable to the command,
 * which it is not. Every other member stays `unknown`, so nothing else narrows.
 */
interface CanonicalPhases extends Phases {
  readonly decoded: CanonicalCommand
}

/**
 * A canonical description, built through the public constructors with phases that do
 * nothing. It is exported so a consumer — a generator, a lint rule, a documenter — can
 * obtain a real branded description without replaying the constructor chain: spread it
 * and substitute its phase records' `run`s. The records it carries are the same literals
 * the constructors write for real call sites, so the vocabulary below cannot drift from
 * them.
 *
 * Its order is not a choice this module makes. The stage brands admit exactly one chain, so
 * any other sequence fails to typecheck here — which is what keeps the derived order
 * non-circular: it is read off a value, and the value's shape is enforced by the types.
 */
export const canonical: WriteDone<CanonicalPhases> = write(
  encode(
    decide(
      decode(read<CanonicalPhases>(() => Effect.void), () => Result.succeed(CanonicalCommand.make({}))),
      // The canonical's decide never resolves — the description's phases "do nothing" —
      // but its error channel must still satisfy the tagged channel rule the brand rides
      // on, so the decider is a `make` value whose phantom error channel is an uninhabited
      // `S.TaggedError`.
      canonicalDecide,
    ),
    () => undefined,
  ),
  () => Effect.void,
)

/**
 * The phase vocabulary, obtained by walking `canonical`. A consumer that needs the phase
 * names, their purity, or their order — a lint rule, a generator, a document — reads them
 * from here instead of restating them, so there is one place a phase is described and the
 * description is the place.
 */
const WALKED_PHASES: readonly PhaseFact[] = canonical.phases.map(
  ({ convention, kind, name }): PhaseFact => ({ convention, kind, name }),
)

export const vocabulary: Vocabulary = {
  module: canonical.module,
  ioCells: canonical.ioCells,
  phases: WALKED_PHASES,
  byKind: {
    pure: WALKED_PHASES.filter((phase) => phase.kind === 'pure').map((phase) => phase.name),
    impure: WALKED_PHASES.filter((phase) => phase.kind === 'impure').map((phase) => phase.name),
  },
  // The one place this name is written. `apply` is defined in this module, so naming it here is a
  // declaration at its definition site, not a restatement beside one.
  applier: 'apply',
}
