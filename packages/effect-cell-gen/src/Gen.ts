import { Cell } from '@systemfsoftware/effect-cell-types'
import { FastCheck as fc } from 'effect'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'

/**
 * The phase bag the generated descriptions instantiate. `command` passes through the pure
 * phases untouched and the decision is `Right` unless a draw places a `Left` — the two
 * error channels a `Left` can inhabit are `number`, so a drawn failure carries a payload,
 * while the read/write error and context channels stay `never`, so no other failure is
 * drawable. The properties this arbitrary feeds are about order, response and failure
 * routing, and the routing properties read which phase drew the `Left` off the drawn value.
 *
 * The payload types are this generator's own input choice, not a claim about the
 * description: every value a phase consumes or produces is `number`, so one drawn
 * function satisfies every phase that shares an invocation shape. `raw` and `decoded`
 * being the same type is what lets one `'either-fail'`/`'either-pass'` run serve either
 * `Either`-shaped phase; `command`, `output` and `response` being the same type is what
 * lets a single `'effect'` run serve both effect phases. A description whose phases
 * genuinely disagree about a payload type is expressible — this bag just does not draw
 * one, because the properties never observe the payload values.
 */
export interface Bag extends Cell.Phases {
  readonly command: number
  readonly raw: number
  readonly decoded: number
  readonly decision: number
  readonly decisionError: number
  readonly output: number
  readonly response: number
  readonly decodeError: number
  readonly readError: never
  readonly writeError: never
  readonly readContext: never
  readonly writeContext: never
}

/**
 * The layer the drawn descriptions are built from, and the phases at which a failure can be
 * drawn. Both are functions of `Cell.canonical` alone, which never changes after load, so they
 * are derived once here rather than per generated value.
 *
 * A canonical description carrying no layers is a load-time error on purpose: every draw would
 * fail the same way, and failing here names the description instead of the draw that tripped over
 * it.
 */
const [TEMPLATE] = Cell.canonical.layers
if (TEMPLATE === undefined) {
  throw new Error('effect-cell-gen: the canonical description carried no layers')
}

/** The phases whose convention admits a `Left`, walked rather than listed. */
const FAILABLE: ReadonlyArray<{
  readonly phaseIndex: number
  readonly convention: 'either-fail' | 'either-pass'
}> = TEMPLATE.phases.flatMap((phase, phaseIndex) =>
  phase.convention === 'either-fail' || phase.convention === 'either-pass'
    ? [{ phaseIndex, convention: phase.convention }]
    : []
)

/**
 * Rebuilds one layer by substituting drawn `run`s into the walked canonical description.
 * The phase records — their names, kinds, conventions and order — come from
 * `Cell.canonical`'s layer template, never from this file; the only thing this function
 * contributes is the run each record executes and the trace it records.
 *
 * The drawn run's shape is chosen by narrowing on `convention`, and that is legitimate
 * rather than a second declaration: `convention` IS the invocation shape — `'effect'`
 * yields an Effect, `'either-fail'`/`'either-pass'` return an `Either`, `'total'` is a
 * plain function — so the phase record's own field says how its run must be called.
 * Because `convention` discriminates the phase union, the narrowed record keeps its exact
 * `name`/`kind`/`convention` literals, and `{ ...phase, run }` stays assignable with no
 * assertion. The `never` default makes an invocation shape this generator does not know a
 * compile error, exactly as it is in the interpreter's own convention switch.
 *
 * Whether a phase draws a `Left` is chosen the same way, never by `name`: only the two
 * `Either` conventions can return a `Left`, so only those runs consult the drawn failure
 * (already resolved to this layer by the caller). The failing phase returns
 * `Either.left(error)`; every other phase returns `Right`, so a description still succeeds
 * except through the one drawn `Left` — exactly the shape the routing properties need.
 *
 * Two observations ride on the runs so a property can read the interpreter's routing off
 * the value: the layer's last phase records the input its run received (the interpreter
 * itself guards that a closed layer's last phase is its write, so this is a walked
 * position, not a name), and a `'total'` run records the whole `Either` it received —
 * the proof that an outcome `Left` travelled forward whole rather than being unwrapped.
 *
 * The canonical description carries a single layer (the stage brands admit exactly one
 * chain), so the drawn recipe's layer count is what repeats this template — an input
 * choice of the generator, like `command` and `writeResponse`, not a claim about the
 * description.
 */
const substituteLayer = (
  trace: Array<string>,
  writeObserved: Array<number>,
  encodeObserved: Array<Either.Either<number, number>>,
  response: number,
  failure: DrawnFailure | undefined,
): Cell.Layer<Bag> => {
  const lastPhaseIndex = TEMPLATE.phases.length - 1
  return {
    phases: TEMPLATE.phases.map((phase, phaseIndex) => {
      const convention = phase.convention
      switch (convention) {
        case 'effect':
          return {
            ...phase,
            run: (input: number): Effect.Effect<number, never, never> =>
              Effect.sync(() => {
                trace.push(phase.name)
                if (phaseIndex === lastPhaseIndex) {
                  writeObserved.push(input)
                }
                return response
              }),
          }
        // One arm for both Either conventions. Their difference is what the interpreter does with
        // a `Left`, not how the run produces one, so a generator that told them apart here would
        // assert a distinction it does not make. The switch stays exhaustive either way.
        case 'either-fail':
        case 'either-pass':
          return {
            ...phase,
            run: (input: number): Either.Either<number, number> => {
              trace.push(phase.name)
              if (failure !== undefined && failure.phaseIndex === phaseIndex) {
                return Either.left(failure.error)
              }
              return Either.right(input)
            },
          }
        case 'total':
          return {
            ...phase,
            run: (outcome: Either.Either<number, number>): number => {
              trace.push(phase.name)
              encodeObserved.push(outcome)
              return Either.match(outcome, {
                onLeft: (error) => error,
                onRight: (decision) => decision,
              })
            },
          }
        default: {
          const unreachable: never = convention
          throw new Error(
            `effect-cell-gen: a phase with an unknown convention ${String(unreachable)} reached the generator`,
          )
        }
      }
    }),
  }
}

/**
 * One draw's recorded failure: the phase that returned a `Left`, the walked convention it
 * did so under, and the drawn payload. The properties read this off the drawn value and
 * derive their expectation from `convention` — they never re-derive which phase failed.
 * `convention` is narrowed to the two `Either` shapes because a `Left` only exists at
 * those phases; the narrowing comes from the walked record, not from a name.
 */
export interface DrawnFailure {
  readonly layerIndex: number
  readonly phaseIndex: number
  readonly name: string
  readonly convention: 'either-fail' | 'either-pass'
  readonly error: number
}

/**
 * One draw of the generator: a built description, the command to apply it to, the trace
 * its phases fill in as the interpreter runs them, the response the last layer's write
 * was drawn to produce — the claim the response property checks — and, when a phase drew
 * a `Left`, which phase it was and under which convention. `writeObserved` and
 * `encodeObserved` are filled by the runs as `Cell.apply` executes them: one entry per
 * completed layer for the input its last phase received, and one per layer for the whole
 * `Either` its successor received. The routing properties read those after applying.
 */
export interface DescriptionCase {
  readonly description: Cell.WriteDone<Bag>
  readonly command: number
  readonly trace: ReadonlyArray<string>
  readonly writeObserved: ReadonlyArray<number>
  readonly encodeObserved: ReadonlyArray<Either.Either<number, number>>
  readonly failure: DrawnFailure | undefined
  readonly lastResponse: number
}

/**
 * The derived generator. What varies per draw is the command, the number of layers (one to
 * three — multi-layer draws are what make the layer-order and last-layer-response claims
 * refutable), each layer's write response, and at most one drawn failure: which
 * `Either`-convention phase of which layer returns a `Left`, and with what payload. The
 * phase sequence, and the choice of which phases can fail, both come from walking
 * `Cell.canonical`, never from this file — a phase is offered the chance to fail only if
 * its walked `convention` is one of the two `Either` shapes.
 *
 * The terminal brand key, the module name and the I/O-cell classification are carried by
 * spreading the canonical description — `Cell.apply` therefore receives a genuinely
 * branded `WriteDone`, not a hand-built object — and its `layers` are replaced by the
 * substituted layers. Nothing about a phase is written down here.
 */
export const description: fc.Arbitrary<DescriptionCase> = fc
  .record({
    command: fc.integer(),
    layers: fc.array(fc.record({ writeResponse: fc.integer() }), { minLength: 1, maxLength: 3 }),
  })
  .chain((drawn) => {
    // Built only when a failable phase exists. `fc.nat` rejects a negative `max` at construction
    // time, not at draw time, so constructing this unconditionally would make the empty-`FAILABLE`
    // branch below unreachable: a walked description with no Either phase would die inside
    // fast-check instead of drawing no failure.
    const drawFailure = (): fc.Arbitrary<DrawnFailure> =>
      fc
        .record({
          layerIndex: fc.nat({ max: drawn.layers.length - 1 }),
          failingIndex: fc.nat({ max: FAILABLE.length - 1 }),
          error: fc.integer(),
        })
        .map(({ layerIndex, failingIndex, error }) => {
          const chosen = FAILABLE[failingIndex]
          if (chosen === undefined) {
            throw new Error('effect-cell-gen: a drawn failing index had no matching phase')
          }
          const phase = TEMPLATE.phases[chosen.phaseIndex]
          if (phase === undefined) {
            throw new Error('effect-cell-gen: a drawn phase index had no phase record')
          }
          return {
            layerIndex,
            phaseIndex: chosen.phaseIndex,
            name: phase.name,
            convention: chosen.convention,
            error,
          }
        })
    const maybeFailure: fc.Arbitrary<DrawnFailure | undefined> = FAILABLE.length === 0
      ? fc.constant(undefined)
      : fc.oneof(
        { arbitrary: drawFailure(), weight: 1 },
        { arbitrary: fc.constant(undefined), weight: 2 },
      )
    return maybeFailure.map((failure) => {
      const trace: Array<string> = []
      const writeObserved: Array<number> = []
      const encodeObserved: Array<Either.Either<number, number>> = []
      const [firstLayer, ...furtherLayers] = drawn.layers
      if (firstLayer === undefined) {
        throw new Error('effect-cell-gen: a generated recipe drew no layers')
      }
      const built: Cell.WriteDone<Bag> = {
        ...Cell.canonical,
        layers: drawn.layers.map(({ writeResponse }, layerIndex) =>
          substituteLayer(
            trace,
            writeObserved,
            encodeObserved,
            writeResponse,
            failure?.layerIndex === layerIndex ? failure : undefined,
          )
        ),
      }
      const lastFurther = furtherLayers[furtherLayers.length - 1]
      return {
        description: built,
        command: drawn.command,
        trace,
        writeObserved,
        encodeObserved,
        failure,
        lastResponse: (lastFurther ?? firstLayer).writeResponse,
      }
    })
  })
