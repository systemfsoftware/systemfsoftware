/// <reference types="vitest/import-meta" />
import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { DrawnCommand, drawnDecision, DrawnDecisionError } from './DrawnDecision.workflow.js'

/**
 * The phase bag the generated descriptions instantiate. `command` passes through the pure
 * phases untouched and the decision is `Success` unless a draw places a `Failure` — the two
 * error channels a `Failure` can inhabit are `number` (decode) and `DrawnDecisionError`
 * (decide), so a drawn failure carries a payload, while the read/write error and context
 * channels stay `never`, so no other failure is drawable. The properties this arbitrary
 * feeds are about order, response and failure routing, and the routing properties read
 * which phase drew the `Failure` off the drawn value.
 *
 * The payload types are this generator's own input choice, not a claim about the
 * description. `command`, `output` and `response` share `number`, and that sharing is what
 * lets a single `'effect'` run serve both effect phases.
 *
 * `raw` and `decoded` do not share: the decode phase is the one place this bag genuinely
 * converts, wrapping the drawn `number` into the `DrawnCommand` the decide phase reads
 * `value` back out of. So the `'either-fail'` run that serves decode is a real
 * construction, not the identity pass-through it once was — a description whose phases
 * disagree about a payload type is not merely expressible here, it is what this bag draws.
 */
export interface Bag extends Cell.Phases {
  readonly command: number
  readonly raw: number
  readonly decoded: DrawnCommand
  readonly decision: number
  readonly decisionError: DrawnDecisionError
  readonly output: number
  readonly response: number
  readonly decodeError: number
  readonly readError: never
  readonly writeError: never
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

/** The phases whose convention admits a `Failure`, walked rather than listed. */
const FAILABLE: readonly {
  readonly phaseIndex: number
  readonly convention: 'either-fail' | 'either-pass'
}[] = TEMPLATE.phases.flatMap((phase, phaseIndex) =>
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
 * yields an Effect, `'either-fail'`/`'either-pass'` return a `Result`, `'total'` is a
 * plain function — so the phase record's own field says how its run must be called.
 * Because `convention` discriminates the phase union, the narrowed record keeps its exact
 * `name`/`kind`/`convention` literals, and `{ ...phase, run }` stays assignable with no
 * assertion. The `never` default makes an invocation shape this generator does not know a
 * compile error, exactly as it is in the interpreter's own convention switch.
 *
 * Whether a phase draws a `Failure` is chosen the same way, never by `name`: only the two
 * `Result` conventions can return a `Failure`, so only those runs consult the drawn
 * failure (already resolved to this layer by the caller). The failing phase returns
 * `Result.fail(error)`; every other phase returns `Result.succeed`, so a description
 * still succeeds except through the one drawn `Failure` — exactly the shape the routing
 * properties need.
 *
 * Two observations ride on the runs so a property can read the interpreter's routing off
 * the value: the layer's last phase records the input its run received (the interpreter
 * itself guards that a closed layer's last phase is its write, so this is a walked
 * position, not a name), and a `'total'` run records the whole `Result` it received —
 * the proof that an outcome `Failure` travelled forward whole rather than being unwrapped.
 *
 * The canonical description carries a single layer (the stage brands admit exactly one
 * chain), so the drawn recipe's layer count is what repeats this template — an input
 * choice of the generator, like `command` and `writeResponse`, not a claim about the
 * description.
 */
const substituteLayer = (
  trace: string[],
  writeObserved: number[],
  encodeObserved: Result.Result<number, DrawnDecisionError>[],
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
        // The two `Result` conventions are told apart here, and only here, by their
        // invocation shape: both return a `Result`, but the decide phase's is branded —
        // `Cell.DecidePhase` demands the `Workflow.make` conjunct, so only the
        // `'either-pass'` run is handed through the constructor. A generator that
        // conflated them would hand the interpreter an unbranded decide run and fail to
        // compile, exactly like any other consumer that skipped `make`.
        case 'either-fail':
          return {
            ...phase,
            run: (input: number): Result.Result<DrawnCommand, number> => {
              trace.push(phase.name)
              if (failure !== undefined && failure.phaseIndex === phaseIndex) {
                return Result.fail(failure.error)
              }
              return Result.succeed(DrawnCommand.make({ value: input }))
            },
          }
        case 'either-pass': {
          // The failure injection is decided before the boundary: the make body
          // stays one exhaustive path, closing only over const bindings. The
          // decision is a snapshot object, not a sentinel — a drawn payload of
          // exactly -1 is a legitimate failure code and must not be conflated
          // with "no injection".
          const injection = failure !== undefined && failure.phaseIndex === phaseIndex
            ? { injected: true as const, error: failure.error }
            : { injected: false as const, error: 0 }
          return {
            ...phase,
            run: drawnDecision(trace, phase.name, injection),
          }
        }
        case 'total':
          return {
            ...phase,
            run: (outcome: Result.Result<number, DrawnDecisionError>): number => {
              trace.push(phase.name)
              encodeObserved.push(outcome)
              return Result.match(outcome, {
                onFailure: (error) => error.code,
                onSuccess: (decision) => decision,
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
 * One draw's recorded failure: the phase that returned a `Failure`, the walked convention it
 * did so under, and the drawn payload. The properties read this off the drawn value and
 * derive their expectation from `convention` — they never re-derive which phase failed.
 * `convention` is narrowed to the two `Result` shapes because a `Failure` only exists at
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
 * a `Failure`, which phase it was and under which convention. `writeObserved` and
 * `encodeObserved` are filled by the runs as `Cell.apply` executes them: one entry per
 * completed layer for the input its last phase received, and one per layer for the whole
 * `Result` its successor received. The routing properties read those after applying.
 */
export interface DescriptionCase {
  readonly description: Cell.WriteDone<Bag>
  readonly command: number
  readonly trace: readonly string[]
  readonly writeObserved: readonly number[]
  readonly encodeObserved: readonly Result.Result<number, DrawnDecisionError>[]
  readonly failure: DrawnFailure | undefined
  readonly lastResponse: number
}

/**
 * The derived generator. What varies per draw is the command, the number of layers (one to
 * three — multi-layer draws are what make the layer-order and last-layer-response claims
 * refutable), each layer's write response, and at most one drawn failure: which
 * `Result`-convention phase of which layer returns a `Failure`, and with what payload. The
 * phase sequence, and the choice of which phases can fail, both come from walking
 * `Cell.canonical`, never from this file — a phase is offered the chance to fail only if
 * its walked `convention` is one of the two `Result` shapes.
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
    // branch below unreachable: a walked description with no `Result` phase would die inside
    // fast-check instead of drawing no failure.
    const drawFailure = (): fc.Arbitrary<DrawnFailure> =>
      fc
        .record({
          layerIndex: fc.nat({ max: drawn.layers.length - 1 }),
          failingIndex: fc.nat({ max: FAILABLE.length - 1 }),
          // The payload -1 is drawn at parity: a drawn failure must be able to carry
          // exactly -1 — the value a non-injection sentinel would collide with — so the
          // routing properties exercise the injection of that value, not just any integer.
          error: fc.oneof(fc.constant(-1), fc.integer()),
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
      const trace: string[] = []
      const writeObserved: number[] = []
      const encodeObserved: Result.Result<number, DrawnDecisionError>[] = []
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

/**
 * The order the generated description declares, read off the value itself. The trace the
 * phases collect is compared against THIS, never against `Cell.vocabulary` — the
 * generator rebuilds the description from the walked canonical value, so a comparison
 * against the generator's own input would be circular; the interpreter's contract is the
 * value's declared order.  */
const declaredOrderOf = (description: Cell.WriteDone<Bag>): readonly string[] =>
  description.layers.flatMap((layer) => layer.phases.map((phase) => phase.name))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Effect = await import('effect/Effect')
  const Result = await import('effect/Result')

  const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((entry, index) => entry === b[index])

  /**
   * The interpreter's whole claim, over generated descriptions: it runs each layer's phases
   * in exactly the order the value declares, observed through the phases themselves. An
   * interpreter that interleaved layers by phase position, skipped a phase, ran one twice,
   * or reordered within a layer leaves a trace that disagrees with the declared order.
   *
   * A draw that placed a `Failure` at a fatal-convention phase aborts the run before every
   * phase executes, so its trace is an honest prefix of the declared order, not the whole
   * order; the order claim does not apply to that draw. Every other draw — including one
   * carrying a pass-through `Failure` — runs every phase and must match the declared order.
   */
  it.effect.prop(
    '∀d_Phases_≡Declared',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const declared = declaredOrderOf(drawn.description)
        yield* Cell.apply(drawn.description, drawn.command)
        return sameOrder(drawn.trace, declared)
      }),
  )

  /**
   * The description's response is the last layer's. Each layer's write was drawn its own
   * response, so an interpreter that returned the first layer's response, or ran the layers
   * out of declared order, disagrees with the last drawn response whenever the draws differ.
   * A fatal-convention `Failure` produces no response at all, so that draw is out of scope.
   */
  it.effect.prop(
    '∀d_Response_=LastWrite',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const response = yield* Cell.apply(drawn.description, drawn.command)
        return response === drawn.lastResponse
      }),
  )

  /**
   * The fatal convention's routing contract: a drawn `Failure` at such a phase fails the whole
   * run — the payload surfaces on the derived error channel — and produces no write
   * response. Only the phases before the failing one may have completed a write: the
   * failing layer's own write, and every later layer's, must never have run. An interpreter
   * that treated the fatal `Failure` as a decision and kept writing fails every clause.
   */
  it.effect.prop(
    '∀d_FailureEitherFail_⊥Write',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-fail') {
          return true
        }
        const outcome = yield* Effect.result(Cell.apply(drawn.description, drawn.command))
        return (
          Result.isFailure(outcome) &&
          outcome.failure === failure.error &&
          drawn.writeObserved.length === failure.layerIndex
        )
      }),
  )

  /**
   * The pass-through convention's routing contract: a drawn `Failure` there is an outcome,
   * not a fault — the successor phase receives the whole `Result` (recorded as the
   * successor's observed input), the write still runs and returns its drawn response, and
   * the `Failure` branch's payload travels on to the write (recorded as the write's
   * received input). An interpreter that treated the outcome `Failure` as fatal, or
   * unwrapped it before the successor, fails one of the clauses.
   */
  it.effect.prop(
    '∀d_FailureEitherPass_=Payload',
    [description],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-pass') {
          return true
        }
        const outcome = yield* Effect.result(Cell.apply(drawn.description, drawn.command))
        if (!Result.isSuccess(outcome)) {
          return false
        }
        const encodeObserved = drawn.encodeObserved[failure.layerIndex]
        return (
          outcome.success === drawn.lastResponse &&
          encodeObserved !== undefined &&
          Result.isFailure(encodeObserved) &&
          encodeObserved.failure.code === failure.error &&
          drawn.writeObserved[failure.layerIndex] === failure.error
        )
      }),
  )
}
