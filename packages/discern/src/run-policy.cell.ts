/**
 * The policy run: the one I/O sandwich of the matcher layer.
 *
 * `read` observes exactly the semantic decisions this input still needs (and
 * no more — deterministic structure that already decides the run is skipped,
 * and the batch is one provider call), `decide` selects the first decisive
 * case through the `select-case` workflow, and `write` runs the selected
 * handler and reports the trace.
 */
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Option, Schema } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { observe } from './decision.resource.js'
import { UncertainMatchError } from './DiscernError.schema.js'
import {
  CaseTrace,
  CompiledPlan,
  SelectedCase,
  SelectedFallback,
  SelectedUncertain,
  Trace,
} from './Inspection.schema.js'
import type { TraceSelection } from './Inspection.schema.js'
import type { Answers, HandlerResult, NodeCore, Pattern, Preview, UncertainContext } from './pattern.resource.js'
import { distinctNodes, reasonOf, statusIs, statusOf } from './pattern.resource.js'
import { SelectCase, selectCase } from './select-case.workflow.js'
import type { CaseVerdict } from './select-case.workflow.js'
import type { PatternResult } from './Verdict.schema.js'

/** One ordered case as the policy run consumes it. */
export interface PolicyCase<Input, Out, Err, Req> {
  readonly id: string
  readonly pattern: Pattern<Input>
  readonly run: (input: Input) => HandlerResult<Out, Err, Req>
}

/** The handler a matcher installs for its first unresolvable case. */
export type UncertainHandler<Input, Out, Err, Req> = (
  input: Input,
  context: UncertainContext,
) => HandlerResult<Out, Err, Req>

/** The structural view of a finished matcher, consumed without importing it. */
export interface PolicySpec<Input, S extends Schema.Constraint, Out, Err, Req> {
  readonly schema: S
  readonly cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>
  readonly uncertainHandler: UncertainHandler<Input, Out, Err, Req> | undefined
  readonly fallback: (input: Input) => HandlerResult<Out, Err, Req>
  readonly plan: CompiledPlan
}

/** What a traced run answers: the handler's value and what the run did. */
export interface PolicyRun<Value> {
  readonly value: Value
  readonly trace: Trace
}

/**
 * Lift a value-or-Effect handler result into an Effect (the typing protocol's
 * `isEffectOf`).
 */
export const isEffectOf = <A, Err, Req>(
  value: A | Effect.Effect<A, Err, Req>,
): value is Effect.Effect<A, Err, Req> => Effect.isEffect(value)

const asEffect = <A, Err, Req>(value: A | Effect.Effect<A, Err, Req>): Effect.Effect<A, Err, Req> =>
  isEffectOf(value) ? value : Effect.succeed(value)

// -------------------------------------------------------------------------------------------------
// Read: the observation walk
// -------------------------------------------------------------------------------------------------

const undecidedOf = (preview: Preview): ReadonlyArray<NodeCore> =>
  preview.resolved === undefined ? preview.decisions : []

/** The case previews up to and including the first deterministically matching one. */
const prefixPreviewsOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
): ReadonlyArray<Preview> => {
  const parts = Arr.map(cases, (item) => item.pattern.preview(input))
  return Option.match(Arr.findFirstIndex(parts, (part) => statusIs(part.resolved, 'Match')), {
    onSome: (index) => Arr.take(parts, index + 1),
    onNone: () => parts,
  })
}

/** The decisions the ordered walk still needs for this input, deduplicated. */
const neededNodesOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
): ReadonlyArray<NodeCore> => distinctNodes(Arr.flatMap(prefixPreviewsOf(cases, input), undecidedOf))

const caseResultOf = <Input, Out, Err, Req>(
  item: PolicyCase<Input, Out, Err, Req>,
  input: Input,
  answers: Answers,
): PatternResult =>
  Option.getOrElse(
    Option.fromNullishOr(item.pattern.preview(input).resolved),
    () => item.pattern.evaluate(input, answers),
  )

const isDecisive = <Input, Out, Err, Req>(
  item: PolicyCase<Input, Out, Err, Req>,
  input: Input,
  answers: Answers,
): boolean => statusOf(caseResultOf(item, input, answers)) !== 'Miss'

interface Evaluated<Input, Out, Err, Req> {
  readonly item: PolicyCase<Input, Out, Err, Req>
  readonly verdict: CaseVerdict
  readonly result: PatternResult
}

const evaluatedOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
  answers: Answers,
): ReadonlyArray<Evaluated<Input, Out, Err, Req>> =>
  Arr.map(cases, (item) => {
    const result = caseResultOf(item, input, answers)
    return {
      item,
      result,
      verdict: { caseId: item.id, status: statusOf(result), reason: reasonOf(result) },
    }
  })

/** Case outcomes in order, truncated after the first decisive one. */
const evaluatedPrefixOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
  answers: Answers,
): ReadonlyArray<Evaluated<Input, Out, Err, Req>> =>
  Option.match(Arr.findFirstIndex(cases, (item) => isDecisive(item, input, answers)), {
    onNone: () => evaluatedOf(cases, input, answers),
    onSome: (index) => evaluatedOf(Arr.take(cases, index + 1), input, answers),
  })

const jsonAnswerOf = (
  id: string,
  answer: Decision.Answer<Decision.Any>,
): readonly [string, Schema.Json] => [id, Option.getOrThrow(Schema.decodeUnknownOption(Schema.Json)(answer))]

const jsonAnswersOf = (answers: Answers): Readonly<Record<string, Schema.Json>> =>
  Object.fromEntries(Arr.map(Object.entries(answers), (entry) => jsonAnswerOf(entry[0], entry[1])))

/** What the write handlers receive: the encoded command plus the live closures. */
type PolicyRead<Input, Out, Err, Req> = (typeof SelectCase)['Encoded'] & {
  readonly input: Input
  readonly plan: CompiledPlan
  readonly jsonAnswers: Readonly<Record<string, Schema.Json>>
  readonly evaluated: ReadonlyArray<Evaluated<Input, Out, Err, Req>>
  readonly uncertainHandler: UncertainHandler<Input, Out, Err, Req> | undefined
  readonly fallback: (input: Input) => HandlerResult<Out, Err, Req>
}

const readOf = <Input, S extends Schema.Constraint, Out, Err, Req>(spec: PolicySpec<Input, S, Out, Err, Req>) =>
(
  input: Input,
): Effect.Effect<
  PolicyRead<Input, Out, Err, Req>,
  AiError.AiError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.flatMap(observe(spec.schema, neededNodesOf(spec.cases, input), input), (answers) => {
    const evaluated = evaluatedPrefixOf(spec.cases, input, answers)
    return Effect.succeed({
      _tag: 'SelectCase',
      cases: Arr.map(evaluated, (entry) => entry.verdict),
      hasUncertainHandler: spec.uncertainHandler !== undefined,
      input,
      plan: spec.plan,
      jsonAnswers: jsonAnswersOf(answers),
      evaluated,
      uncertainHandler: spec.uncertainHandler,
      fallback: spec.fallback,
    })
  })

// -------------------------------------------------------------------------------------------------
// Write: dispatch to the selected branch
// -------------------------------------------------------------------------------------------------

const traceOf = <Input, Out, Err, Req>(read: PolicyRead<Input, Out, Err, Req>, selected: TraceSelection): Trace =>
  new Trace({
    version: 2,
    planFingerprint: read.plan.fingerprint,
    answers: read.jsonAnswers,
    cases: Arr.map(
      read.evaluated,
      (entry) =>
        new CaseTrace({ id: entry.verdict.caseId, status: entry.verdict.status, reason: entry.verdict.reason }),
    ),
    selected,
  })

/** The decisive case is always the last of the evaluated prefix the read sent. */
const decisiveOf = <Input, Out, Err, Req>(read: PolicyRead<Input, Out, Err, Req>): Evaluated<Input, Out, Err, Req> =>
  Option.getOrThrow(Arr.last(read.evaluated))

// -------------------------------------------------------------------------------------------------
// Policy
// -------------------------------------------------------------------------------------------------

const PolicyTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Policy')

/**
 * A finished, reusable matcher: an ordered set of semantic rules over one input
 * type, with a fallback. Call it like a function to get an `Effect`; the
 * attached properties report the plan or run with a trace. Replaying from
 * recorded observations is providing `Model.replayLayer` at the caller's edge.
 */
export interface Policy<
  Input,
  Out,
  Err = never,
  Req = never,
  S extends Schema.Constraint = Schema.Constraint,
> {
  readonly [PolicyTypeId]: typeof PolicyTypeId
  (input: Input): Effect.Effect<
    Out,
    Err | AiError.AiError | UncertainMatchError,
    Req | DecisionModel.DecisionModel | S['EncodingServices']
  >
  readonly plan: CompiledPlan
  /** Run, and additionally report which cases were evaluated and how each resolved. */
  readonly runWithTrace: (input: Input) => Effect.Effect<
    PolicyRun<Out>,
    Err | AiError.AiError | UncertainMatchError,
    Req | DecisionModel.DecisionModel | S['EncodingServices']
  >
}

/** Compile a matcher's structural view into the callable policy sandwich. */
export const finishPolicy = <Input, S extends Schema.Constraint, Out, Err, Req>(
  spec: PolicySpec<Input, S, Out, Err, Req>,
): Policy<Input, Out, Err, Req, S> => {
  const cell = Sandwich.named('discern.policy.run')(readOf(spec))
    .decide(selectCase)
    .write({
      CaseSelected: (selected, read) =>
        Effect.map(asEffect(decisiveOf(read).item.run(read.input)), (value) => ({
          value,
          trace: traceOf(read, new SelectedCase({ id: selected.caseId })),
        })),
      FallbackSelected: (_selected, read) =>
        Effect.map(asEffect(read.fallback(read.input)), (value) => ({
          value,
          trace: traceOf(read, new SelectedFallback({})),
        })),
      UncertainHandled: (selected, read) =>
        Option.match(Option.fromNullishOr(read.uncertainHandler), {
          onNone: () =>
            Effect.fail(
              new UncertainMatchError({ caseId: selected.caseId, reason: decisiveOf(read).verdict.reason }),
            ),
          onSome: (handler) =>
            Effect.map(
              asEffect(handler(read.input, { caseId: selected.caseId, result: decisiveOf(read).result })),
              (value) => ({
                value,
                trace: traceOf(read, new SelectedUncertain({ id: selected.caseId })),
              }),
            ),
        }),
      UncertainUnhandled: (refusal, _read) =>
        Effect.fail(new UncertainMatchError({ caseId: refusal.caseId, reason: refusal.reason })),
      CommandRejected: (rejected, _read) => Effect.die(rejected),
    })

  const runWithTrace = (input: Input) => cell.run(input)
  const run = (input: Input) => Effect.map(runWithTrace(input), (finished) => finished.value)
  const props: Pick<Policy<Input, Out, Err, Req, S>, typeof PolicyTypeId | 'plan' | 'runWithTrace'> = {
    [PolicyTypeId]: PolicyTypeId,
    plan: spec.plan,
    runWithTrace: (input: Input) => runWithTrace(input),
  }
  const policy: Policy<Input, Out, Err, Req, S> = Object.assign((input: Input) => run(input), props)
  return policy
}
