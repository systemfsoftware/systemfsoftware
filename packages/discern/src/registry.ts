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
 * ordinary Effect code. Members are held under their own id, as the record's
 * key, so two members cannot share an id and a lookup by id cannot miss.
 */
import { Array as Arr, Effect, Match, Option, Predicate } from 'effect'
import { dual } from 'effect/Function'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { ask, type ClassifyDecision, on } from './decision.js'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import {
  invokeProcedure,
  invokeProcedureWithFallback,
  prepareRoute,
  type RoutingAnswer,
  type RoutingView,
} from './invoke-procedure.cell.js'
import {
  type AnyProcedure,
  type ErrorOf,
  examplesOrNone,
  type FallbackInvokeOptions,
  type HomogeneousProcedure,
  type InvokeOptions,
  make,
  type OutputOf,
  type Procedure,
  type RequirementsOf,
} from './procedure.js'
import {
  DepthExceededError,
  NoEligibleProcedureError,
  ProcedureCommandRejectedError,
  RoutingUncertainError,
} from './ProcedureError.schema.js'
import { region } from './region.service.js'
import type { RouteOptions } from './Route.schema.js'
import type { Route } from './select-route.workflow.js'

const RegistryTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Registry')

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

type IdsOf<Members> = Extract<keyof Members, string>

type AnyRegistry = Registry<Readonly<Record<string, AnyProcedure>>, Schema.Constraint>

/**
 * A registry of homogeneous procedures, held as a record keyed by member id.
 *
 * The channel parameters default to the union of what the members' `run`
 * returns, so a plain `Registry<Members, S, RouteInput>` is exact.
 */
export interface Registry<
  Members extends Readonly<Record<string, AnyProcedure>>,
  S extends Schema.Constraint,
  RouteInput extends Schema.Constraint = S,
  Value = OutputOf<Members[keyof Members]>,
  Failure = ErrorOf<Members[keyof Members]>,
  Requirements = RequirementsOf<Members[keyof Members]>,
> extends Pipeable {
  readonly [RegistryTypeId]: typeof RegistryTypeId
  readonly input: S
  /** The schema the routing decision actually sees. Equal to `input` unless projected. */
  readonly routeInput: RouteInput
  readonly members: Members
  readonly ids: ReadonlyArray<IdsOf<Members>>
  readonly get: <Id extends IdsOf<Members>>(id: Id) => Members[Id]
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
    Route,
    AiError.AiError | DecisionIdCollisionError,
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
      | DecisionIdCollisionError
      | ProcedureCommandRejectedError
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
      | DecisionIdCollisionError
      | ProcedureCommandRejectedError
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
      { readonly route: Route; readonly value: Value | FallbackValue },
      | Failure
      | FallbackError
      | AiError.AiError
      | DecisionIdCollisionError
      | ProcedureCommandRejectedError
      | NoEligibleProcedureError
      | DepthExceededError,
      Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
    (
      input: S['Type'],
      options?: InvokeOptions<S['Type']>,
    ): Effect.Effect<
      { readonly route: Route; readonly value: Value },
      | Failure
      | AiError.AiError
      | DecisionIdCollisionError
      | ProcedureCommandRejectedError
      | NoEligibleProcedureError
      | DepthExceededError
      | RoutingUncertainError,
      Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
    >
  }
}

const DEFAULT_INSTRUCTIONS = 'Choose the procedure that best handles this request'

const instructionsOf = (instructions: string | undefined): string => instructions ?? DEFAULT_INSTRUCTIONS

const criterion = (member: AnyProcedure): string =>
  member.examples.length === 0
    ? member.description
    : `${member.description}. For example: ${member.examples.join('; ')}`

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

const isRegistry = (u: unknown): u is AnyRegistry => Predicate.hasProperty(u, RegistryTypeId)

/**
 * The member held under one of the registry's own keys. The key is a member
 * key by construction, so the read is total: it never misses and never yields
 * nothing.
 */
const memberOf = <Members extends Readonly<Record<string, AnyProcedure>>, K extends keyof Members>(
  members: Members,
  key: K,
): Members[K] => members[key]

/**
 * The member keys, each one an id by construction: a record cannot hold two
 * entries under one key, so the ids a registry routes between are unique
 * without a runtime check.
 */
const idsOf = <Members extends Readonly<Record<string, AnyProcedure>>>(
  members: Members,
): ReadonlyArray<IdsOf<Members>> =>
  Arr.filter(Object.keys(members), (key): key is IdsOf<Members> => Object.hasOwn(members, key))

/**
 * Criteria keyed by member id. `Object.fromEntries` defines own properties, so
 * an id of `__proto__` lands in the criteria instead of on the prototype.
 */
const criteriaOf = <Members extends Readonly<Record<string, AnyProcedure>>>(
  members: Members,
  candidates: ReadonlyArray<IdsOf<Members>>,
): Record<string, string> =>
  Object.fromEntries(Arr.map(candidates, (id) => [id, criterion(memberOf(members, id))] as const))

/**
 * Build a registry. Adding or removing a member renormalizes every
 * probability in it, so thresholds calibrated against an older registry do not
 * carry over — re-run `Discern.Eval` against `registry.decision` when the
 * membership changes.
 */
const buildRegistry = <
  S extends Schema.Constraint,
  const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
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
  type RouteIds = IdsOf<Members>
  type SeenR = DecisionModel.DecisionModel | RouteInput['EncodingServices']

  const ids = idsOf(members)
  const instructions = instructionsOf(settings.instructions)

  const eligibleIds = (value: S['Type']): ReadonlyArray<RouteIds> =>
    Arr.filter(ids, (id) => memberOf(members, id).eligible(value))

  const runMember = (id: RouteIds, value: S['Type']) => region(id)(memberOf(members, id).run(value))

  const decisions = new Map<string, ClassifyDecision<RouteInput['Type'], string, RouteInput>>()

  const decisionFor = (candidates: ReadonlyArray<RouteIds>) => {
    const key = JSON.stringify(candidates)
    const found = decisions.get(key)
    if (found !== undefined) {
      return found
    }
    const built = on(routeInput).classify({
      ...idFieldOf(settings.id, candidates.length === ids.length),
      instructions,
      criteria: criteriaOf(members, candidates),
    })
    decisions.set(key, built)
    return built
  }

  const view: RoutingView<S['Type'], RouteInput['Type'], SeenR, RouteIds> = {
    membership: ids,
    eligibleIds,
    select,
    askRouting: (candidates, projected) =>
      Effect.map(ask(decisionFor(candidates), projected), (answer): RoutingAnswer => ({
        probabilities: { ...answer.probabilities },
      })),
  }

  const views = { ...view, runMember }

  function invokeWithRoute<FallbackValue, FallbackError = never, FallbackServices = never>(
    request: S['Type'],
    invokeOptions: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | SeenR
  >
  function invokeWithRoute(
    request: S['Type'],
    invokeOptions?: InvokeOptions<S['Type']>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | ProcedureCommandRejectedError
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
      onNone: () => invokeProcedure(views, { input: request, options: { routing } }),
      onSome: (uncertain) =>
        invokeProcedureWithFallback<
          S['Type'],
          RouteInput['Type'],
          Value,
          Failure,
          Requirements,
          SeenR,
          RouteIds,
          FallbackValue,
          FallbackError,
          FallbackServices
        >(views, { input: request, options: { routing, onUncertain: uncertain } }),
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
    | ProcedureCommandRejectedError
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
    | ProcedureCommandRejectedError
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
            RouteIds,
            FallbackValue,
            FallbackError,
            FallbackServices
          >(views, { input: request, options: { routing, onUncertain: uncertain } }),
          (routed) => routed.value,
        ),
    })
  }

  return {
    [RegistryTypeId]: RegistryTypeId,
    input,
    routeInput,
    members,
    ids,
    get: <Id extends RouteIds>(id: Id): Members[Id] => members[id],
    decision: decisionFor(ids),
    route: (request, routeOptions) => prepareRoute(view, request, routeOptions),
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
    const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    RouteInput extends Schema.Constraint = S,
  >(
    input: S,
    members: Members,
    options: RegistryOptions<S, RouteInput> & { readonly routeBy: RouteBy<S, RouteInput> },
  ): Registry<Members, S, RouteInput, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    input: S,
    members: Members,
    options?: RegistryOptions<S, S>,
  ): Registry<Members, S, S, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    RouteInput extends Schema.Constraint = S,
  >(
    members: Members,
    options: RegistryOptions<S, RouteInput> & { readonly routeBy: RouteBy<S, RouteInput> },
  ): (input: S) => Registry<Members, S, RouteInput, Value, Failure, Requirements>
  <
    S extends Schema.Constraint,
    const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    members: Members,
    options?: RegistryOptions<S, S>,
  ): (input: S) => Registry<Members, S, S, Value, Failure, Requirements>
} = dual(
  (args: IArguments) => Predicate.hasProperty(args[0], 'ast'),
  <
    S extends Schema.Constraint,
    const Members extends Readonly<Record<string, Procedure<S['Type'], Value, Failure, Requirements, S>>>,
    Value,
    Failure,
    Requirements,
  >(
    input: S,
    members: Members,
    options?: RegistryOptions<S, S>,
  ) => {
    const settings = options ?? {}
    return Option.match(Option.fromUndefinedOr(settings.routeBy), {
      onNone: () => buildRegistry(input, members, input, identityOf, settings),
      onSome: (routeBy) => buildRegistry(input, members, routeBy.schema, routeBy.select, settings),
    })
  },
)

/** Read one member of a registry by its id. Every id is held, so the read cannot miss. */
export const get: {
  <Members extends Readonly<Record<string, AnyProcedure>>, S extends Schema.Constraint, Id extends IdsOf<Members>>(
    self: Registry<Members, S>,
    id: Id,
  ): Members[Id]
  <Members extends Readonly<Record<string, AnyProcedure>>, S extends Schema.Constraint, Id extends IdsOf<Members>>(
    id: Id,
  ): (self: Registry<Members, S>) => Members[Id]
} = dual(
  2,
  <Members extends Readonly<Record<string, AnyProcedure>>, S extends Schema.Constraint, Id extends IdsOf<Members>>(
    self: Registry<Members, S>,
    id: Id,
  ): Members[Id] => self.get(id),
)

/** Choose a procedure from the whole distribution, without running it. */
export const route: {
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
  >(
    input: S['Type'],
    options?: RouteOptions,
  ): (
    self: Registry<Members, S, RouteInput>,
  ) => Effect.Effect<
    Route,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
  >(
    self: Registry<Members, S, RouteInput>,
    input: S['Type'],
    options?: RouteOptions,
  ): Effect.Effect<
    Route,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
} = dual(
  (args: IArguments) => isRegistry(args[0]),
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
  >(
    self: Registry<Members, S, RouteInput>,
    input: S['Type'],
    options?: RouteOptions,
  ): Effect.Effect<
    Route,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | RouteInput['EncodingServices']
  > => self.route(input, options),
)

/** Route, then run the chosen procedure. */
export const invoke: {
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    input: S['Type'],
    options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): (
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
  ) => Effect.Effect<
    Value | FallbackValue,
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    Value | FallbackValue,
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    input: S['Type'],
    options?: InvokeOptions<S['Type']>,
  ): (
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
  ) => Effect.Effect<
    Value,
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    options?: InvokeOptions<S['Type']>,
  ): Effect.Effect<
    Value,
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
} = dual(
  (args: IArguments) => isRegistry(args[0]),
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    invokeOptions?:
      | InvokeOptions<S['Type']>
      | FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ) => {
    const { routing, onUncertain } = invokeOptions ?? {}
    return Option.match(Option.fromUndefinedOr(onUncertain), {
      onNone: () => self.invoke(input, { routing }),
      onSome: (uncertain) => self.invoke(input, { routing, onUncertain: uncertain }),
    })
  },
)
export const invokeWithRoute: {
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    input: S['Type'],
    options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): (
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
  ) => Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    options: FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    Requirements | FallbackServices | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    input: S['Type'],
    options?: InvokeOptions<S['Type']>,
  ): (
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
  ) => Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    options?: InvokeOptions<S['Type']>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | DecisionModel.DecisionModel | RouteInput['EncodingServices']
  >
} = dual(
  (args: IArguments) => isRegistry(args[0]),
  <
    Members extends Readonly<Record<string, AnyProcedure>>,
    S extends Schema.Constraint,
    RouteInput extends Schema.Constraint = S,
    Value = OutputOf<Members[keyof Members]>,
    Failure = ErrorOf<Members[keyof Members]>,
    Requirements = RequirementsOf<Members[keyof Members]>,
    FallbackValue = never,
    FallbackError = never,
    FallbackServices = never,
  >(
    self: Registry<Members, S, RouteInput, Value, Failure, Requirements>,
    input: S['Type'],
    invokeOptions?:
      | InvokeOptions<S['Type']>
      | FallbackInvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ) => {
    const { routing, onUncertain } = invokeOptions ?? {}
    return Option.match(Option.fromUndefinedOr(onUncertain), {
      onNone: () => self.invokeWithRoute(input, { routing }),
      onSome: (uncertain) => self.invokeWithRoute(input, { routing, onUncertain: uncertain }),
    })
  },
)

export const fromRegistry = <
  S extends Schema.Constraint,
  const Members extends Readonly<Record<string, HomogeneousProcedure<S['Type'], S>>>,
>(options: {
  readonly description: string
  readonly examples?: ReadonlyArray<string>
  readonly registry: Registry<Members, S>
  readonly routing?: RouteOptions
}): Procedure<
  S['Type'],
  OutputOf<Members[keyof Members]>,
  | ErrorOf<Members[keyof Members]>
  | AiError.AiError
  | DecisionIdCollisionError
  | ProcedureCommandRejectedError
  | RoutingUncertainError
  | NoEligibleProcedureError
  | DepthExceededError,
  RequirementsOf<Members[keyof Members]> | DecisionModel.DecisionModel | S['EncodingServices'],
  S
> =>
  make({
    description: options.description,
    examples: examplesOrNone(options.examples),
    input: options.registry.input,
    run: (input) =>
      options.routing === undefined
        ? options.registry.invoke(input)
        : options.registry.invoke(input, { routing: options.routing }),
  })
