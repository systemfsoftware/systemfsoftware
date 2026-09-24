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
 *
 * A registry is a cold blueprint over the routing machinery. Member reads
 * (`get`), routing (`route`), and invocation (`invoke`, `invokeWithRoute`)
 * are each one operation: the kind derives the method, the data-first dual,
 * and the data-last dual from a single type-level transition. Everything else
 * the rest of the package reads — `input`, `routeInput`, `members`, `ids`,
 * `decision` — is a target over the registry's type index. `invoke`'s error
 * channel is option-dependent: `RoutingUncertainError` is present without
 * `onUncertain` and absent with it, so the transition reads the call's
 * arguments, like a question whose `onUnsure` drops the `Unsure` channel.
 */
import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Match, Option, Predicate } from 'effect'
import { dual, identity } from 'effect/Function'
import type * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { ask, type ClassifyDecision, on } from './decision.blueprint.js'
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
  type InvokeOptions,
  make,
  type OutputOf,
  type Procedure,
  type RequirementsOf,
} from './procedure.blueprint.js'
import {
  DepthExceededError,
  NoEligibleProcedureError,
  ProcedureCommandRejectedError,
  RoutingUncertainError,
} from './ProcedureError.schema.js'
import { region } from './region.service.js'
import type { RouteOptions } from './Route.schema.js'
import type { Route, RouteUncertain } from './select-route.workflow.js'

type Top<A = unknown> = A

export const TypeId = Symbol.for('@systemfsoftware/discern/Registry')
export type TypeId = typeof TypeId

/**
 * How the model sees a request when routing.
 *
 * A procedure consumes the whole input; a router only needs enough of it to
 * choose. Projecting keeps large evidence — a diff, a document, a transcript —
 * out of the routing prompt, which cuts tokens and raises signal.
 */
export interface RouteBy<S extends Schema.Constraint, RouteInput extends Schema.Constraint> {
  readonly schema: RouteInput
  readonly select: (input: S['Type']) => RouteInput['Type']
}

export interface RegistryOptions<S extends Schema.Constraint, RouteInput extends Schema.Constraint> {
  readonly id?: string
  readonly instructions?: string
  /** Route on a projection of the input rather than the whole of it. */
  readonly routeBy?: RouteBy<S, RouteInput>
}

/**
 * The data a registry is minted from: the schemas it accepts and routes on,
 * its members, the routing decision over the full membership, and the
 * per-invocation closures the operations forward to. The closures are the
 * erased implementation boundary: each is written with the registry's precise
 * types, recorded here as a plain function, and its public type comes back
 * from the operation's transition over the index.
 */
export interface RegistrySpec {
  readonly input: Schema.Constraint
  readonly routeInput: Schema.Constraint
  readonly members: Readonly<Record<string, AnyProcedure>>
  readonly ids: ReadonlyArray<string>
  readonly decision: Top
  readonly memberAt: (id: string) => AnyProcedure
  readonly routeOf: (input: never, options?: never) => Top
  readonly invokeOf: (input: never, options?: never) => Top
  readonly invokeWithRouteOf: (input: never, options?: never) => Top
}

/**
 * The type index a registry carries: its membership, the schema it accepts
 * and the schema it routes on, and the success, failure, and requirement
 * channels the members' programs agree on.
 */
export interface RegistryIndex<
  Members extends Readonly<Record<string, AnyProcedure>>,
  S extends Schema.Constraint,
  RouteInput extends Schema.Constraint,
  Value,
  Failure,
  Requirements,
> {
  readonly Members: Members
  readonly Input: S
  readonly RouteInput: RouteInput
  readonly Value: Value
  readonly Failure: Failure
  readonly Requirements: Requirements
}

/** The widest index a registry can be invoked through. */
export type AnyRegistryIndex = RegistryIndex<
  Readonly<Record<string, AnyProcedure>>,
  Schema.Constraint,
  Schema.Constraint,
  Top,
  Top,
  Top
>

type MembersOf<X> = X extends { readonly Members: infer Members extends AnyProcedureRecord } ? Members : never
type InputSchemaOf<X> = X extends { readonly Input: infer S extends Schema.Constraint } ? S : never
type RouteInputOf<X> = X extends { readonly RouteInput: infer RouteInput extends Schema.Constraint } ? RouteInput
  : never
type ValueOf<X> = X extends { readonly Value: infer Value } ? Value : never
type FailureOf<X> = X extends { readonly Failure: infer Failure } ? Failure : never
type IndexRequirementsOf<X> = X extends { readonly Requirements: infer Requirements } ? Requirements : never
type RequestOf<X> = InputSchemaOf<X>['Type']
type ServicesOf<X> = RouteInputOf<X>['EncodingServices']
type AnyProcedureRecord = Readonly<Record<string, AnyProcedure>>
type ProjectedOf<X> = RouteInputOf<X>['Type']
type IdsOf<Members> = Extract<keyof Members, string>
type MemberAt<Members, Args> = Args extends readonly [infer Id, ...ReadonlyArray<Top>]
  ? Id extends keyof Members ? Members[Id] : never
  : never

type HandlerValue<Returned> = [Returned] extends [Effect.Effect<infer Value, Top, Top>] ? Value : Returned
type HandlerFailure<Returned> = [Returned] extends [Effect.Effect<Top, infer Failure, Top>] ? Failure : never
type HandlerRequirements<Returned> = [Returned] extends [Effect.Effect<Top, Top, infer Requirements>] ? Requirements
  : never

/** The failures every invocation carries, whatever the caller does about doubt. */
type SeenOf<X> = DecisionModel.DecisionModel | ServicesOf<X>

type InvokeOptionsOf<X> = {
  readonly routing?: RouteOptions | undefined
  readonly onUncertain?: (input: RequestOf<X>, route: (typeof RouteUncertain)['Encoded']) => Top
}

type InvokeOut<X, Args> = Args extends readonly [Top, {
  readonly onUncertain: (...args: never[]) => infer Returned
}] ? Effect.Effect<
    ValueOf<X> | HandlerValue<Returned>,
    | FailureOf<X>
    | HandlerFailure<Returned>
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    IndexRequirementsOf<X> | HandlerRequirements<Returned> | SeenOf<X>
  >
  : Effect.Effect<
    ValueOf<X>,
    | FailureOf<X>
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    IndexRequirementsOf<X> | SeenOf<X>
  >

type InvokeWithRouteOut<X, Args> = Args extends readonly [Top, {
  readonly onUncertain: (...args: never[]) => infer Returned
}] ? Effect.Effect<
    { readonly route: Route; readonly value: ValueOf<X> | HandlerValue<Returned> },
    | FailureOf<X>
    | HandlerFailure<Returned>
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    IndexRequirementsOf<X> | HandlerRequirements<Returned> | SeenOf<X>
  >
  : Effect.Effect<
    { readonly route: Route; readonly value: ValueOf<X> },
    | FailureOf<X>
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    IndexRequirementsOf<X> | SeenOf<X>
  >
/** The member held under one of the registry's own keys. The read is total by construction. */
export interface RegistryGet extends Blueprint.Operation {
  readonly params: readonly [id: IdsOf<MembersOf<this['Index']>>]
  readonly out: MemberAt<MembersOf<this['Index']>, this['Args']>
}

/** Choose a procedure from the whole distribution, without running it. */
export interface RegistryRoute extends Blueprint.Operation {
  readonly params:
    | readonly [input: RequestOf<this['Index']>]
    | readonly [input: RequestOf<this['Index']>, options?: RouteOptions]
  readonly lastRest: readonly [] | readonly [options?: RouteOptions]
  readonly out: Effect.Effect<
    Route,
    AiError.AiError | DecisionIdCollisionError,
    SeenOf<this['Index']>
  >
}

/** Route, then run the chosen procedure. */
export interface RegistryInvoke extends Blueprint.Operation {
  readonly params:
    | readonly [input: RequestOf<this['Index']>]
    | readonly [input: RequestOf<this['Index']>, options: InvokeOptionsOf<this['Index']>]
  readonly lastRest: readonly [] | readonly [options: InvokeOptionsOf<this['Index']>]
  readonly out: InvokeOut<this['Index'], this['Args']>
}

/** As `invoke`, but also returns the routing decision itself. */
export interface RegistryInvokeWithRoute extends Blueprint.Operation {
  readonly params:
    | readonly [input: RequestOf<this['Index']>]
    | readonly [input: RequestOf<this['Index']>, options: InvokeOptionsOf<this['Index']>]
  readonly lastRest: readonly [] | readonly [options: InvokeOptionsOf<this['Index']>]
  readonly out: InvokeWithRouteOut<this['Index'], this['Args']>
}

/** The schema the registry accepts. */
export interface RegistryInput extends Blueprint.Target {
  readonly target: InputSchemaOf<this['Index']>
}

/** The schema the routing decision actually sees. Equal to `input` unless projected. */
export interface RegistryRouteInput extends Blueprint.Target {
  readonly target: RouteInputOf<this['Index']>
}

/** Every member, held under its own id. */
export interface RegistryMembers extends Blueprint.Target {
  readonly target: MembersOf<this['Index']>
}

/** Every member key, each one an id by construction. */
export interface RegistryIds extends Blueprint.Target {
  readonly target: ReadonlyArray<IdsOf<MembersOf<this['Index']>>>
}

/**
 * The classification for the full membership, exposed for inspection and
 * evaluation. Eligibility may narrow the set actually asked about at run time.
 */
export interface RegistryDecision extends Blueprint.Target {
  readonly target: ClassifyDecision<ProjectedOf<this['Index']>, string, RouteInputOf<this['Index']>>
}

/** Four operations, five targets: one declaration per registry capability. */
export interface RegistryOps {
  readonly get: RegistryGet
  readonly route: RegistryRoute
  readonly invoke: RegistryInvoke
  readonly invokeWithRoute: RegistryInvokeWithRoute
  readonly input: RegistryInput
  readonly routeInput: RegistryRouteInput
  readonly members: RegistryMembers
  readonly ids: RegistryIds
  readonly decision: RegistryDecision
}

type AnyRegistry = Registry<Readonly<Record<string, AnyProcedure>>, Schema.Constraint>

/**
 * A registry of homogeneous procedures, held as a record keyed by member id.
 *
 * The channel parameters default to the union of what the members' `run`
 * returns, so a plain `Registry<Members, S, RouteInput>` is exact.
 */
export type Registry<
  Members extends Readonly<Record<string, AnyProcedure>>,
  S extends Schema.Constraint,
  RouteInput extends Schema.Constraint = S,
  Value = OutputOf<Members[keyof Members]>,
  Failure = ErrorOf<Members[keyof Members]>,
  Requirements = RequirementsOf<Members[keyof Members]>,
> = Blueprint.Blueprint<
  typeof TypeId,
  RegistrySpec,
  RegistryOps,
  RegistryIndex<Members, S, RouteInput, Value, Failure, Requirements>
>

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

/**
 * The member held under one of the registry's own keys. The key is a member
 * key by construction, so the read is total: it never misses and never yields
 * nothing.
 */
const memberOf = <Members extends Readonly<Record<string, AnyProcedure>>, K extends keyof Members>(
  members: Members,
  key: K,
): Members[K] => members[key]

/** The same read through the erased shape the spec records. Reads forward through the held members. */
const memberAtOf = (members: Readonly<Record<string, AnyProcedure>>, id: string): AnyProcedure =>
  Arr.findFirst(Object.entries(members), ([key]) => key === id).pipe(
    Option.map(([, member]) => member),
    Option.getOrThrow,
  )
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

const Registries = Blueprint.make<RegistrySpec, AnyRegistryIndex>()(TypeId).operations<RegistryOps>()({
  operations: {
    get: (self: AnyRegistry, id: string) => self.spec.memberAt(id),
    route: {
      run: (self: AnyRegistry, input: never, options?: never) => self.spec.routeOf(input, options),
      isDataFirst: (args) => Registries.is(args[0]),
    },
    invoke: {
      run: (self: AnyRegistry, input: never, options?: never) => self.spec.invokeOf(input, options),
      isDataFirst: (args) => Registries.is(args[0]),
    },
    invokeWithRoute: {
      run: (self: AnyRegistry, input: never, options?: never) => self.spec.invokeWithRouteOf(input, options),
      isDataFirst: (args) => Registries.is(args[0]),
    },
  },
  targets: {
    input: (self: AnyRegistry) => self.spec.input,
    routeInput: (self: AnyRegistry) => self.spec.routeInput,
    members: (self: AnyRegistry) => self.spec.members,
    ids: (self: AnyRegistry) => self.spec.ids,
    decision: (self: AnyRegistry) => self.spec.decision,
  },
})

/** Read one member of a registry by its id. Every id is held, so the read cannot miss. */
export const get = Registries.operations.get

/** Choose a procedure from the whole distribution, without running it. */
export const route = Registries.operations.route

/** Route, then run the chosen procedure. */
export const invoke = Registries.operations.invoke

/** As `invoke`, but also returns the routing decision itself. */
export const invokeWithRoute = Registries.operations.invokeWithRoute

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

  const invokeWithRouteOf = <FallbackValue, FallbackError, FallbackServices>(
    request: S['Type'],
    invokeOptions?: InvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    Requirements | FallbackServices | SeenR
  > => {
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

  const invokeOf = <FallbackValue, FallbackError, FallbackServices>(
    request: S['Type'],
    invokeOptions?: InvokeOptions<S['Type'], FallbackValue, FallbackError, FallbackServices>,
  ) => Effect.map(invokeWithRouteOf(request, invokeOptions), (routed) => routed.value)

  return Registries.of<RegistryIndex<Members, S, RouteInput, Value, Failure, Requirements>>({
    input,
    routeInput,
    members,
    ids,
    decision: decisionFor(ids),
    memberAt: (id) => memberAtOf(members, id),
    routeOf: (request: S['Type'], routeOptions?: RouteOptions) => prepareRoute(view, request, routeOptions),
    invokeOf,
    invokeWithRouteOf,
  })
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
      onNone: () => buildRegistry(input, members, input, identity, settings),
      onSome: (routeBy) => buildRegistry(input, members, routeBy.schema, routeBy.select, settings),
    })
  },
)

export const fromRegistry = <
  S extends Schema.Constraint,
  const Members extends AnyProcedureRecord,
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
