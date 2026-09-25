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
import { dual } from 'effect/Function'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { observe } from './decision.blueprint.js'
import {
  DecisionIdCollisionError,
  InvalidThresholdError,
  PolicyCommandRejected,
  UncertainMatchError,
} from './DiscernError.schema.js'
import {
  CaseTrace,
  CompiledPlan,
  SelectedCase,
  SelectedFallback,
  SelectedUncertain,
  Trace,
} from './Inspection.schema.js'
import type { TraceSelection } from './Inspection.schema.js'
import type { Answers, NodeCore, Pattern, PatternRefusal, Preview, UncertainContext } from './pattern.blueprint.js'
import { distinctNodes, evaluate, preview, reasonOf, statusIs, statusOf } from './pattern.blueprint.js'
import { SelectCase, selectCase } from './select-case.workflow.js'
import type { CaseVerdict } from './select-case.workflow.js'
import type { PatternResult } from './Verdict.schema.js'

/** One ordered case as the policy run consumes it. The builder wraps `run` once at the API edge, so the cell calls an Effect-returning closure with no lift. */
export interface PolicyCase<Input, Out, Err, Req> {
  readonly id: string
  readonly pattern: Pattern<Input>
  readonly run: (input: Input) => Effect.Effect<Out, Err, Req>
}

/** The handler a matcher installs for its first unresolvable case, wrapped at the API edge like every case. */
export type UncertainHandler<Input, Out, Err, Req> = (
  input: Input,
  context: UncertainContext,
) => Effect.Effect<Out, Err, Req>

/** The structural view of a finished matcher, consumed without importing it. */
export interface PolicySpec<Input, S extends Schema.Constraint, Out, Err, Req> {
  readonly schema: S
  readonly cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>
  readonly uncertainHandler:
    | ((input: Input, context: UncertainContext) => Effect.Effect<Out, Err, Req>)
    | undefined
  readonly fallback: (input: Input) => Effect.Effect<Out, Err, Req>
  readonly plan: CompiledPlan
}

/** What a traced run answers: the handler's value and what the run did. */
export interface PolicyRun<Value> {
  readonly value: Value
  readonly trace: Trace
}

// -------------------------------------------------------------------------------------------------
// Read: the observation walk
// -------------------------------------------------------------------------------------------------

const undecidedOf = (preview: Preview): ReadonlyArray<NodeCore> =>
  preview.resolved === undefined ? preview.decisions : []

/** The cases up to and including the first deterministically matching one. */
const prefixCasesOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
): ReadonlyArray<PolicyCase<Input, Out, Err, Req>> =>
  Option.match(
    Arr.findFirstIndex(cases, (item) => statusIs(preview(item.pattern, input).resolved, 'Match')),
    { onSome: (index) => Arr.take(cases, index + 1), onNone: () => cases },
  )

/** The first crossed threshold a case in the prefix carries, if any. */
const refusalOfCases = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
): Option.Option<PatternRefusal> => Arr.head(Arr.flatMap(cases, (item) => item.pattern.refusals))

/** The case previews up to and including the first deterministically matching one. */
const prefixPreviewsOf = <Input, Out, Err, Req>(
  cases: ReadonlyArray<PolicyCase<Input, Out, Err, Req>>,
  input: Input,
): ReadonlyArray<Preview> => Arr.map(prefixCasesOf(cases, input), (item) => preview(item.pattern, input))

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
    Option.fromNullishOr(preview(item.pattern, input).resolved),
    () => evaluate(item.pattern, input, answers),
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

const jsonConfidenceOf = (confidence: number | undefined): Record<string, Schema.Json> =>
  confidence === undefined ? {} : { confidence }

const classifyAnswerJsonOf = (answer: Decision.Answer<Decision.Classify<string>>): Schema.Json => ({
  label: answer.label,
  probabilities: { ...answer.probabilities },
  ...jsonConfidenceOf(answer.confidence),
})

const rateAnswerJsonOf = (answer: Decision.Answer<Decision.Rate<string>>): Schema.Json => ({
  label: answer.label,
  rating: answer.rating,
  probabilities: { ...answer.probabilities },
  ...jsonConfidenceOf(answer.confidence),
})

const rateOrClassifyJsonOf = (
  answer: Decision.Answer<Decision.Classify<string>> | Decision.Answer<Decision.Rate<string>>,
): Schema.Json => 'rating' in answer ? rateAnswerJsonOf(answer) : classifyAnswerJsonOf(answer)

/**
 * The traceable form of one validated answer. Every answer a provider returns
 * is validated to one of the three answer shapes before `observe` answers, so
 * the Json record is rebuilt field by field instead of re-decoding data whose
 * shape the provider contract already proves.
 */
const jsonAnswerOf = (answer: Decision.Answer<Decision.Any>): Schema.Json => {
  if ('probability' in answer) return { probability: answer.probability }
  return rateOrClassifyJsonOf(answer)
}

const jsonAnswersOf = (answers: Answers): Readonly<Record<string, Schema.Json>> =>
  Object.fromEntries(Arr.map(Object.entries(answers), (entry) => [entry[0], jsonAnswerOf(entry[1])]))

/** What the write handlers receive: the encoded command plus the live closures. */
type PolicyRead<Input, Out, Err, Req> = (typeof SelectCase)['Encoded'] & {
  readonly input: Input
  readonly plan: CompiledPlan
  readonly jsonAnswers: Readonly<Record<string, Schema.Json>>
  readonly evaluated: ReadonlyArray<Evaluated<Input, Out, Err, Req>>
  readonly uncertainHandler:
    | ((input: Input, context: UncertainContext) => Effect.Effect<Out, Err, Req>)
    | undefined
  readonly fallback: (input: Input) => Effect.Effect<Out, Err, Req>
}

const readOf = <Input, S extends Schema.Constraint, Out, Err, Req>(spec: PolicySpec<Input, S, Out, Err, Req>) =>
(
  input: Input,
): Effect.Effect<
  PolicyRead<Input, Out, Err, Req>,
  AiError.AiError | DecisionIdCollisionError | InvalidThresholdError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Option.match(refusalOfCases(prefixCasesOf(spec.cases, input)), {
    onSome: (refusal) => Effect.fail(new InvalidThresholdError(refusal)),
    onNone: () =>
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
      }),
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

/** The decisive case is the one non-Miss entry of the evaluated prefix, the same rule the workflow decided by. */
const decisiveOf = <Input, Out, Err, Req>(
  read: PolicyRead<Input, Out, Err, Req>,
): Option.Option<Evaluated<Input, Out, Err, Req>> =>
  Arr.findFirst(read.evaluated, (entry) => statusOf(entry.result) !== 'Miss')

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
    | Err
    | AiError.AiError
    | DecisionIdCollisionError
    | InvalidThresholdError
    | PolicyCommandRejected
    | UncertainMatchError,
    Req | DecisionModel.DecisionModel | S['EncodingServices']
  >
  readonly plan: CompiledPlan
  readonly runWithTrace: (input: Input) => PolicyTraced<Out, Err, Req, S>
}

/** What running a policy with a trace answers: the value and its trace, or why the run refused. */
export type PolicyTraced<Out, Err, Req, S extends Schema.Constraint> = Effect.Effect<
  PolicyRun<Out>,
  | Err
  | AiError.AiError
  | DecisionIdCollisionError
  | InvalidThresholdError
  | PolicyCommandRejected
  | UncertainMatchError,
  Req | DecisionModel.DecisionModel | S['EncodingServices']
>

/** Compile a matcher's structural view into the callable policy sandwich. */
export const finishPolicy = <Input, S extends Schema.Constraint, Out, Err, Req>(
  spec: PolicySpec<Input, S, Out, Err, Req>,
): Policy<Input, Out, Err, Req, S> => {
  const cell = Sandwich.named('discern.policy.run')(readOf(spec))
    .decide(selectCase)
    .write({
      CaseSelected: (selected, read) =>
        Effect.map(Option.getOrThrow(decisiveOf(read)).item.run(read.input), (value) => ({
          value,
          trace: traceOf(read, new SelectedCase({ id: selected.caseId })),
        })),
      FallbackSelected: (_selected, read) =>
        Effect.map(read.fallback(read.input), (value) => ({
          value,
          trace: traceOf(read, new SelectedFallback({})),
        })),
      UncertainHandled: (selected, read) =>
        Effect.map(
          Option.getOrThrow(Option.fromNullishOr(read.uncertainHandler))(
            read.input,
            { caseId: selected.caseId, result: Option.getOrThrow(decisiveOf(read)).result },
          ),
          (value) => ({ value, trace: traceOf(read, new SelectedUncertain({ id: selected.caseId })) }),
        ),
      UncertainUnhandled: (refusal, _read) =>
        Effect.fail(new UncertainMatchError({ caseId: refusal.caseId, reason: refusal.reason })),
      CommandRejected: (rejected, read) =>
        Effect.fail(
          new PolicyCommandRejected({
            caseIds: Arr.map(read.evaluated, (entry) => entry.verdict.caseId),
            cause: rejected,
          }),
        ),
    })

  const traced = (input: Input) => cell.run(input)
  const run = (input: Input) => Effect.map(traced(input), (finished) => finished.value)
  const props: Pick<Policy<Input, Out, Err, Req, S>, typeof PolicyTypeId | 'plan' | 'runWithTrace'> = {
    [PolicyTypeId]: PolicyTypeId,
    plan: spec.plan,
    runWithTrace: (input: Input) => traced(input),
  }
  const policy: Policy<Input, Out, Err, Req, S> = Object.assign((input: Input) => run(input), props)
  return policy
}

/** Run a policy and report which cases were evaluated and how each resolved: `policy.runWithTrace(input)` for `pipe`. */
export const runWithTrace: {
  <Input>(input: Input): <Out, Err, Req, S extends Schema.Constraint>(
    self: Policy<Input, Out, Err, Req, S>,
  ) => PolicyTraced<Out, Err, Req, S>
  <Input, Out, Err, Req, S extends Schema.Constraint>(
    self: Policy<Input, Out, Err, Req, S>,
    input: Input,
  ): PolicyTraced<Out, Err, Req, S>
} = dual(
  2,
  <Input, Out, Err, Req, S extends Schema.Constraint>(
    self: Policy<Input, Out, Err, Req, S>,
    input: Input,
  ): PolicyTraced<Out, Err, Req, S> => self.runWithTrace(input),
)
