/**
 * Group procedures that share an input type so a request can be routed
 * between them.
 *
 * Routing is one classification decision, so it inherits Discern's treatment
 * of uncertainty: a registry that cannot tell two procedures apart says so
 * instead of picking the winner by a hair. What routing deliberately does not
 * do is parameterize — a registry selects a procedure, it never constructs its
 * input — so registries are homogeneous: every member accepts the registry's
 * input type. Procedures with different inputs compose statically, through
 * ordinary Effect code.
 */
import { Array as Arr, Effect, Match, Option, Result } from 'effect'
import { dual } from 'effect/Function'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { ask, type ClassifyDecision, on } from './decision.resource.js'
import {
  invokeProcedure,
  invokeProcedureWithFallback,
  prepareRoute,
  type RoutingView,
} from './invoke-procedure.cell.js'
import type { Top } from './pattern.resource.js'
import { examplesOrNone, type FallbackInvokeOptions, make } from './procedure.resource.js'
import type {
  Any as AnyProcedure,
  ErrorOf,
  IdOf,
  InvokeOptions,
  OutputOf,
  Procedure,
  RequirementsOf,
} from './procedure.resource.js'
import {
  DepthExceededError,
  DuplicateProcedureIdError,
  NoEligibleProcedureError,
  RoutingUncertainError,
  UnknownProcedureError,
} from './ProcedureError.schema.js'
import type { RouteCandidate, RouteOptions } from './Route.schema.js'
import type { Route } from './select-route.workflow.js'

/**
 * How the model sees a request when routing.
 *
 * A procedure consumes the whole input; a router only needs enough of it to
 * choose. Projecting keeps large evidence — a diff, a document, a transcript —
 * out of the routing prompt, which cuts tokens and raises signal.
 */
export interface RouteBy<S extends Schema.Constraint, R extends Schema.Constraint> {
  readonly schema: R
  readonly select: (input: S['Type']) => R['Type']
}

export interface RegistryOptions<S extends Schema.Constraint, RouteInput extends Schema.Constraint> {
  readonly id?: string
  readonly instructions?: string
  /** Route on a projection of the input rather than the whole of it. */
  readonly routeBy?: RouteBy<S, RouteInput>
}

/**
 * A registry of homogeneous procedures.
 *
 * The channel parameters default to the union of what the members' `run`
 * returns, so a plain `Registry<Members, S, RouteInput>` is exact.
 */
export interface Registry<
  Members extends ReadonlyArray<AnyProcedure>,
  S extends Schema.Constraint,
  RouteInput extends Schema.Constraint = S,
  Value = OutputOf<Members[number]>,
  Failure = ErrorOf<Members[number]>,
  Requirements = RequirementsOf<Members[number]>,
> extends Pipeable {
  readonly input: S
  /** The schema the routing decision actually sees. Equal to `input` unless projected. */
  readonly routeInput: RouteInput
  readonly members: Members
  readonly ids: ReadonlyArray<Members[number]['id']>
  readonly get: <Id extends IdOf<Members[number]>>(id: Id) => Extract<Members[number], { readonly id: Id }>
  /**
   * The classification for the full membership, exposed for inspection and
   * evaluation. Eligibility may narrow the set actually asked about at run time.
   */
  readonly decision: ClassifyDecision<RouteInput['Type'], string, RouteInput>
  /**
   * Choose a procedure from the whole distribution, not just the provider's
   * chosen label. Returns uncertainty rather than picking a near-tie, and
   * `RouteNone` when eligibility ruled everything out.
   */
  readonly route: (
    input: S['Type'],
    options?: RouteOptions,
  ) => Effect.Effect<
    Route<Members[number]['id']>,
    AiError.AiError,
    DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  /** Route, then run the chosen procedure. */
  readonly invoke: {
    <FallbackValue, FallbackError = never, FallbackServices = never>(
      input: S['Type'],
      options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
    ): Effect.Effect<
      Value | FallbackValue,
      | Failure
      | FallbackError
      | AiError.AiError
      | AiError.InvalidRequestError
      | NoEligibleProcedureError
      | DepthExceededError,
      Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
    (
      input: S['Type'],
      options?: InvokeOptions<S['Type']>,
    ): Effect.Effect<
      Value,
      | Failure
      | AiError.AiError
      | AiError.InvalidRequestError
      | NoEligibleProcedureError
      | DepthExceededError
      | RoutingUncertainError,
      Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
  }
  /** As `invoke`, but also returns the routing decision itself. */
  readonly invokeWithRoute: {
    <FallbackValue, FallbackError = never, FallbackServices = never>(
      input: S['Type'],
      options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
    ): Effect.Effect<
      { readonly route: Route<Members[number]['id']>; readonly value: Value | FallbackValue },
      | Failure
      | FallbackError
      | AiError.AiError
      | AiError.InvalidRequestError
      | NoEligibleProcedureError
      | DepthExceededError,
      Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
    (
      input: S['Type'],
      options?: InvokeOptions<S['Type']>,
    ): Effect.Effect<
      { readonly route: Route<Members[number]['id']>; readonly value: Value },
      | Failure
      | AiError.AiError
      | AiError.InvalidRequestError
      | NoEligibleProcedureError
      | DepthExceededError
      | RoutingUncertainError,
      Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
  }
}

/** The homogeneous member shape a registry accepts: every member takes the registry's input. */
export interface Homogeneous<S extends Schema.Constraint> extends Procedure<string, S['Type'], Top, Top, Top, S> {}

const DEFAULT_INSTRUCTIONS = 'Choose the procedure that best handles this request'

const instructionsOf = (instructions: string | undefined): string => instructions ?? DEFAULT_INSTRUCTIONS

const criterion = (member: AnyProcedure): string =>
  member.examples.length === 0
    ? member.description
    : `${member.description}. For example: ${member.examples.join('; ')}`

const duplicatedIdOf = (ids: ReadonlyArray<string>): Option.Option<string> => {
  const seen = new Set<string>()
  return Arr.findFirst(ids, (id) => {
    const duplicate = seen.has(id)
    seen.add(id)
    return duplicate
  })
}

const refuseDuplicate = (duplicate: Option.Option<string>): void => {
  if (Option.isSome(duplicate)) {
    throw new DuplicateProcedureIdError({ id: duplicate.value })
  }
}

const idFieldOf = (id: string | undefined, whole: boolean): { readonly id: string } | undefined =>
  Match.value(whole).pipe(
    Match.when(
      true,
      () => Option.match(Option.fromUndefinedOr(id), { onNone: () => undefined, onSome: (value) => ({ id: value }) }),
    ),
    Match.when(false, () => undefined),
    Match.exhaustive,
  )

const identityOf = <V>(value: V): V => value

const criterionOf = (byId: ReadonlyMap<string, AnyProcedure>, id: string): string =>
  Option.match(Option.fromUndefinedOr(byId.get(id)), { onNone: () => '', onSome: criterion })

const isMemberIdOf = <Member extends { readonly id: string }>(
  members: ReadonlyArray<Member>,
): (id: string) => id is Member['id'] =>
(id): id is Member['id'] => Arr.some(members, (member) => member.id === id)

const narrowedCandidatesOf = <Ids extends string>(
  isMemberId: (id: string) => id is Ids,
  ranked: ReadonlyArray<RouteCandidate>,
): ReadonlyArray<RouteCandidate<Ids>> =>
  Arr.filterMap(ranked, (candidate) =>
    isMemberId(candidate.id)
      ? Result.succeed({ id: candidate.id, probability: candidate.probability })
      : Result.failVoid)

const narrowedRouteOf = <Ids extends string>(
  isMemberId: (id: string) => id is Ids,
  route: Route,
): Effect.Effect<Route<Ids>> =>
  Match.value(route).pipe(
    Match.tag('RouteMatched', (matched) =>
      Effect.orDie(
        Effect.map(
          Effect.fromOption(
            isMemberId(matched.id) ? Option.some(matched.id) : Option.none(),
            () => new UnknownProcedureError({ id: matched.id, known: [] }),
          ),
          (id) => ({ ...matched, id, ranked: narrowedCandidatesOf(isMemberId, matched.ranked) }),
        ),
      )),
    Match.tag('RouteUncertain', (uncertain) =>
      Effect.succeed({ ...uncertain, ranked: narrowedCandidatesOf(isMemberId, uncertain.ranked) })),
    Match.tag('RouteNone', (none) =>
      Effect.succeed(none)),
    Match.exhaustive,
  )

/**
 * Criteria keyed by member id. `Object.fromEntries` defines own properties, so
 * an id of `__proto__` lands in the criteria instead of on the prototype.
 */
const criteriaOf = (
  byId: ReadonlyMap<string, AnyProcedure>,
  candidates: ReadonlyArray<string>,
): Record<string, string> => Object.fromEntries(Arr.map(candidates, (id) => [id, criterionOf(byId, id)] as const))

/**
 * Build a registry. Adding or removing a member renormalizes every
 * probability in it, so thresholds calibrated against an older registry do not
 * carry over — re-run `Discern.Eval` against `registry.decision` when the
 * membership changes.
 */
const buildRegistry = <
  S extends Schema.Constraint,
  const Members extends readonly [
    Procedure<string, S['Type'], Value, Failure, Requirements, S>,
    Procedure<string, S['Type'], Value, Failure, Requirements, S>,
    ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
  ],
  Value,
  Failure,
  Requirements,
  RouteInput extends Schema.Constraint,
>(
  input: S,
  members: Members,
  routeInput: RouteInput,
  select: (input: S['Type']) => RouteInput['Type'],
  settings: { readonly id?: string; readonly instructions?: string },
): Registry<Members, S, RouteInput, Value, Failure, Requirements> => {
  type RouteIds = Members[number]['id']
  type SeenR = DecisionModel.DecisionModel | RouteInput['EncodingServices']

  refuseDuplicate(duplicatedIdOf(Arr.map(members, (member) => member.id)))

  const isMemberId = isMemberIdOf(members)
  const ids: ReadonlyArray<RouteIds> = Arr.filter(Arr.map(members, (member) => member.id), isMemberId)
  const instructions = instructionsOf(settings.instructions)
  const byId = new Map<string, Members[number]>(Arr.map(members, (member) => [member.id, member] as const))

  const eligibleIds = (input: S['Type']) =>
    Arr.map(Arr.filter(members, (member) => member.eligible(input)), (member) => member.id)

  const runMember = (id: string, input: S['Type']) =>
    Effect.flatMap(
      Effect.orDie(
        Effect.fromOption(Option.fromUndefinedOr(byId.get(id)), () => new UnknownProcedureError({ id, known: ids })),
      ),
      (member) => member.run(input),
    )

  const decisions = new Map<string, ClassifyDecision<RouteInput['Type'], string, RouteInput>>()

  const decisionFor = (candidates: ReadonlyArray<string>) => {
    const key = candidates.join('')
    const found = decisions.get(key)
    if (found !== undefined) {
      return found
    }
    const built = on(routeInput).classify({
      ...idFieldOf(settings.id, candidates.length === members.length),
      instructions,
      criteria: criteriaOf(byId, candidates),
    })
    decisions.set(key, built)
    return built
  }

  const view: RoutingView<S['Type'], RouteInput['Type'], SeenR> = {
    membership: ids,
    eligibleIds,
    select,
    askRouting: (candidates, projected) => ask(decisionFor(candidates), projected),
  }

  const views = { ...view, runMember }

  const runRouted = <V>(routed: { readonly route: Route; readonly value: V }) =>
    Effect.map(narrowedRouteOf(isMemberId, routed.route), (route) => ({ route, value: routed.value }))

  function invokeWithRoute<FallbackValue, FallbackError = never, FallbackServices = never>(
    request: S['Type'],
    invokeOptions: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route<RouteIds>; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | AiError.InvalidRequestError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | SeenR
  >
  function invokeWithRoute(
    request: S['Type'],
    invokeOptions?: InvokeOptions<S['Type']>,
  ): Effect.Effect<
    { readonly route: Route<RouteIds>; readonly value: Value },
    | Failure
    | AiError.AiError
    | AiError.InvalidRequestError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | SeenR
  >
  function invokeWithRoute<FallbackValue, FallbackError = never, FallbackServices = never>(
    request: S['Type'],
    invokeOptions?:
      | InvokeOptions<S['Type']>
      | FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ) {
    const { routing, onUncertain } = invokeOptions ?? {}
    return Option.match(Option.fromUndefinedOr(onUncertain), {
      onNone: () =>
        Effect.flatMap(
          invokeProcedure(views, { input: request, options: { routing } }),
          (routed) => runRouted(routed),
        ),
      onSome: (uncertain) =>
        Effect.flatMap(
          invokeProcedureWithFallback<
            S['Type'],
            RouteInput['Type'],
            Value,
            Failure,
            Requirements,
            SeenR,
            FallbackValue,
            FallbackError,
            FallbackServices
          >(views, { input: request, options: { routing, onUncertain: uncertain } }),
          (routed) => runRouted(routed),
        ),
    })
  }

  function invoke<FallbackValue, FallbackError = never, FallbackServices = never>(
    request: S['Type'],
    invokeOptions: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    Value | FallbackValue,
    | Failure
    | FallbackError
    | AiError.AiError
    | AiError.InvalidRequestError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | SeenR
  >
  function invoke(
    request: S['Type'],
    invokeOptions?: InvokeOptions<S['Type']>,
  ): Effect.Effect<
    Value,
    | Failure
    | AiError.AiError
    | AiError.InvalidRequestError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | SeenR
  >
  function invoke<FallbackValue, FallbackError = never, FallbackServices = never>(
    request: S['Type'],
    invokeOptions?:
      | InvokeOptions<S['Type']>
      | FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ) {
    const { routing, onUncertain } = invokeOptions ?? {}
    return Option.match(Option.fromUndefinedOr(onUncertain), {
      onNone: () =>
        Effect.map(invokeProcedure(views, { input: request, options: { routing } }), (routed) => routed.value),
      onSome: (uncertain) =>
        Effect.map(
          invokeProcedureWithFallback<
            S['Type'],
            RouteInput['Type'],
            Value,
            Failure,
            Requirements,
            SeenR,
            FallbackValue,
            FallbackError,
            FallbackServices
          >(views, { input: request, options: { routing, onUncertain: uncertain } }),
          (routed) => routed.value,
        ),
    })
  }

  return {
    input,
    routeInput,
    members,
    ids,
    get: <Id extends IdOf<Members[number]>>(id: Id): Extract<Members[number], { readonly id: Id }> => {
      const member = Arr.findFirst(
        members,
        (candidate): candidate is Extract<Members[number], { readonly id: Id }> => candidate.id === id,
      )
      return Option.match(member, {
        onNone: () => {
          throw new UnknownProcedureError({ id, known: ids })
        },
        onSome: (found) => found,
      })
    },
    decision: decisionFor(ids),
    route: (request, routeOptions) =>
      Effect.flatMap(prepareRoute(view, request, routeOptions), (found) => narrowedRouteOf(isMemberId, found)),
    invoke,
    invokeWithRoute,
    ...Prototype,
  }
}

/**
 * Group procedures that share an input type so a request can be routed
 * between them.
 *
 * Adding or removing a member renormalizes every probability in it, so
 * thresholds calibrated against an older registry do not carry over — re-run
 * `Discern.Eval` against `registry.decision` when the membership changes.
 */
export const registry: {
  <
    S extends Schema.Constraint,
    const Members extends readonly [
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
    ],
    Value = OutputOf<Members[number]>,
    Failure = ErrorOf<Members[number]>,
    Requirements = RequirementsOf<Members[number]>,
    RouteInput extends Schema.Constraint = S,
  >(
    input: S,
    members: Members,
    options: RegistryOptions<S, RouteInput> & { readonly routeBy: RouteBy<S, RouteInput> },
  ): Registry<Members, S, RouteInput, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends readonly [
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
    ],
    Value = OutputOf<Members[number]>,
    Failure = ErrorOf<Members[number]>,
    Requirements = RequirementsOf<Members[number]>,
  >(
    input: S,
    members: Members,
    options?: RegistryOptions<S, S>,
  ): Registry<Members, S, S, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends readonly [
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
    ],
    Value = OutputOf<Members[number]>,
    Failure = ErrorOf<Members[number]>,
    Requirements = RequirementsOf<Members[number]>,
    RouteInput extends Schema.Constraint = S,
  >(
    members: Members,
    options: RegistryOptions<S, RouteInput> & { readonly routeBy: RouteBy<S, RouteInput> },
  ): (input: S) => Registry<Members, S, RouteInput, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends readonly [
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
    ],
    Value = OutputOf<Members[number]>,
    Failure = ErrorOf<Members[number]>,
    Requirements = RequirementsOf<Members[number]>,
  >(
    members: Members,
    options?: RegistryOptions<S, S>,
  ): (input: S) => Registry<Members, S, S, Value, Failure, Requirements>
} = dual(
  (args: IArguments) => !Array.isArray(args[0]),
  <
    S extends Schema.Constraint,
    const Members extends readonly [
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      Procedure<string, S['Type'], Value, Failure, Requirements, S>,
      ...Array<Procedure<string, S['Type'], Value, Failure, Requirements, S>>,
    ],
    Value,
    Failure,
    Requirements,
  >(
    input: S,
    members: Members,
    options?: RegistryOptions<S, S>,
  ) => {
    const settings = options ?? {}
    refuseDuplicate(duplicatedIdOf(Arr.map(members, (member) => member.id)))
    return Option.match(Option.fromUndefinedOr(settings.routeBy), {
      onNone: () => buildRegistry(input, members, input, identityOf, settings),
      onSome: (routeBy) => buildRegistry(input, members, routeBy.schema, routeBy.select, settings),
    })
  },
)

/**
 * Present a registry as a procedure, so registries nest.
 *
 * A flat classification gets vague past roughly eight members: the criteria
 * grow into a long prompt and the probabilities spread thin. Grouping related
 * procedures behind one entry keeps each routing decision a short, sharp
 * question, and nothing new is needed to do it — a registry-as-procedure is
 * just another member of its parent.
 */
export const fromRegistry = <
  const Id extends string,
  S extends Schema.Constraint,
  const Members extends ReadonlyArray<Homogeneous<S>>,
>(options: {
  readonly id: Id
  readonly description: string
  readonly examples?: ReadonlyArray<string>
  readonly registry: Registry<Members, S>
  readonly routing?: RouteOptions
}): Procedure<
  Id,
  S['Type'],
  OutputOf<Members[number]>,
  | ErrorOf<Members[number]>
  | AiError.AiError
  | AiError.InvalidRequestError
  | RoutingUncertainError
  | NoEligibleProcedureError
  | DepthExceededError,
  RequirementsOf<Members[number]> | DecisionModel.DecisionModel | S['EncodingServices'],
  S
> =>
  make({
    id: options.id,
    description: options.description,
    examples: examplesOrNone(options.examples),
    input: options.registry.input,
    run: (input) =>
      options.routing === undefined
        ? options.registry.invoke(input)
        : options.registry.invoke(input, { routing: options.routing }),
  })
