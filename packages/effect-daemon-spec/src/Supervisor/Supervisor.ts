import { Context, Effect, HashMap, Layer, Match, Option, Predicate, Queue, Ref, Scope } from 'effect'
import { dual } from 'effect/Function'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import { initialStateOf } from '../kernel/initial-supervisor-state.js'
import { Running } from '../kernel/interpret-supervision-event.workflow.js'
import type { SupervisorState } from '../kernel/interpret-supervision-event.workflow.js'
import type { ChildId } from '../kernel/SupervisionLimits.schema.js'
import type {
  AutoShutdown,
  BackoffSchedule,
  ChildDeclaration,
  DynamicKind,
  RestartStrategy,
  SupervisionPolicy,
} from '../kernel/SupervisorPolicy.schema.js'
import { SupervisionPolicy as SupervisionPolicyClass } from '../kernel/SupervisorPolicy.schema.js'
import { Binder, type BoundChild } from './bound-child.js'
import { type BareFiberProgram, fiberPort, type FiberProgram, mediumFor, readyOnStart } from './FiberMedium.js'
import { type Medium, type MediumPortShape } from './Medium.js'
import {
  awaitTerminated,
  Handle,
  mailboxOf,
  offerEvent,
  type RunningSupervisor,
  shutdown,
  stateOf,
} from './running-supervisor.handle.js'
import { Steps, type SupervisorStepCell, supervisorStepFor } from './supervisor-step.cell.js'

export const SpecTypeId = Symbol.for('@systemfsoftware/effect-daemon-spec/SupervisorSpec')
export type SpecTypeId = typeof SpecTypeId

/** A fiber-hosted child: a bare effect, a function of `ready`, or a nested spec. */
export type FiberChild<R = never> =
  | BareFiberProgram
  | ((ready: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope | R>)
  | SupervisorSpec<R>

/** Any child program, on any medium. */
export type ChildProgram<R = never> = BareFiberProgram | FiberProgram | SupervisorSpec<R>

/**
 * A child declared against a medium port, or against the default fiber medium
 * (KTD9, R17, R18). Its `binding` resolves the medium from context at
 * acquisition, so the same declaration runs on any medium.
 */
export interface ChildSpec<R = never> extends Pipeable {
  readonly childId: ChildId
  readonly declaration: ChildDeclaration
  readonly binding: Effect.Effect<BoundChild, never, Scope.Scope | R>
}

interface Binding<R> {
  readonly declaration: ChildDeclaration
  readonly binding: Effect.Effect<BoundChild, never, Scope.Scope | R>
}

interface SpecParts<R> {
  readonly name: string
  readonly strategy: RestartStrategy
  readonly intensity: number
  readonly periodMillis: number
  readonly autoShutdown: AutoShutdown
  readonly coolDownMillis: number | undefined
  readonly backoff: BackoffSchedule
  readonly declarations: ReadonlyArray<ChildDeclaration>
  readonly bindings: ReadonlyArray<Binding<R>>
  readonly dynamic: DynamicKind
}

/**
 * A supervision tree (KTD11). `R` is the environment its children need beyond
 * the supervisor's own scope: the ports they are bound to and the media they
 * run on (R17, R18).
 */
export interface SupervisorSpec<R = never> extends Pipeable, SpecParts<R> {
  readonly [SpecTypeId]: typeof SpecTypeId
  readonly scoped: Effect.Effect<RunningSupervisor, never, Scope.Scope | R>
  readonly layer: Layer.Layer<never, never, Exclude<R, Scope.Scope>>
}

const hasSpecTag = Predicate.hasProperty(SpecTypeId)

export const isSupervisorSpec = (value: unknown): value is SupervisorSpec<never> =>
  hasSpecTag(value) && value[SpecTypeId] === SpecTypeId

const WORKER_SHUTDOWN: ChildDeclaration['shutdown'] = { _tag: 'Graceful', millis: 5_000 }

const SUPERVISOR_SHUTDOWN: ChildDeclaration['shutdown'] = { _tag: 'Infinity' }

const LIVENESS_TICK_MILLIS = 1_000

const policyOfParts = <R>(parts: SpecParts<R>): SupervisionPolicy =>
  new SupervisionPolicyClass({
    strategy: parts.strategy,
    intensity: parts.intensity,
    periodMillis: parts.periodMillis,
    autoShutdown: parts.autoShutdown,
    coolDown: parts.coolDownMillis === undefined
      ? { _tag: 'NoCoolDown' }
      : { _tag: 'CoolDownAfter', millis: parts.coolDownMillis },
    backoff: parts.backoff,
    dynamic: parts.dynamic,
    livenessTickMillis: LIVENESS_TICK_MILLIS,
    childDeclarations: parts.declarations,
  })

const drainOf = (
  handle: RunningSupervisor,
  step: SupervisorStepCell,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(
    Queue.take(mailboxOf(handle)),
    (event) =>
      Effect.flatMap(Effect.asVoid(step.run(event)), () =>
        Effect.flatMap(Ref.get(stateOf(handle)), (state) =>
          Match.value(state).pipe(
            Match.when({ _tag: 'Terminated' }, () =>
              Effect.void),
            Match.orElse(() => drainOf(handle, step)),
          ))),
  )

const fiberMediumOf = (): Effect.Effect<Medium<FiberProgram, never, Scope.Scope>, never, never> =>
  Effect.map(Effect.serviceOption(fiberPort), (found) =>
    Option.match(found, {
      onNone: () => mediumFor<never>(),
      onSome: (port) => port.medium,
    }))

const scopedOf = <R>(parts: SpecParts<R>): Effect.Effect<RunningSupervisor, never, Scope.Scope | R> =>
  Effect.gen(function*() {
    const supervisorScope = yield* Effect.scope
    const initial: SupervisorState = new Running({ core: initialStateOf(policyOfParts(parts)) })
    const bound = yield* Effect.forEach(
      parts.bindings,
      (entry) => Effect.map(entry.binding, (child) => [entry.declaration.childId, child] as const),
      { concurrency: 1 },
    )
    const context = yield* Effect.context<Scope.Scope>()
    const fiber = yield* fiberMediumOf()
    const handle = yield* Handle.make(parts.name, initial, HashMap.fromIterable(bound), context, fiber)
    const step = supervisorStepFor(Steps.runtimeOf({ handle }))
    yield* Effect.forkIn(drainOf(handle, step), supervisorScope)
    yield* offerEvent(handle, { _tag: 'SupervisorStarted', at: 0 })
    yield* Effect.addFinalizer(() => shutdown(handle))
    return handle
  })

const specOf = <R>(parts: SpecParts<R>): SupervisorSpec<R> => {
  const scoped = scopedOf(parts)
  return {
    [SpecTypeId]: SpecTypeId,
    ...parts,
    scoped,
    layer: Layer.effectDiscard(Effect.asVoid(scoped)),
    ...Prototype,
  }
}

const partsOf = <R>(self: SupervisorSpec<R>): SpecParts<R> => ({
  name: self.name,
  strategy: self.strategy,
  intensity: self.intensity,
  periodMillis: self.periodMillis,
  autoShutdown: self.autoShutdown,
  coolDownMillis: self.coolDownMillis,
  backoff: self.backoff,
  declarations: self.declarations,
  bindings: self.bindings,
  dynamic: self.dynamic,
})

export const make = (name: string): SupervisorSpec<never> =>
  specOf({
    name,
    strategy: 'one_for_one',
    intensity: 1,
    periodMillis: 5_000,
    autoShutdown: 'never',
    coolDownMillis: undefined,
    backoff: { baseMillis: 0, multiplier: 1, capMillis: 0 },
    declarations: [],
    bindings: [],
    dynamic: { _tag: 'NoDynamicChildren' },
  })

export const strategy: {
  (strategy: RestartStrategy): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, strategy: RestartStrategy): SupervisorSpec<R>
} = dual(
  2,
  <R>(self: SupervisorSpec<R>, strategy: RestartStrategy): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), strategy }),
)

export const intensity: {
  (intensity: number, periodMillis: number): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, intensity: number, periodMillis: number): SupervisorSpec<R>
} = dual(
  3,
  <R>(self: SupervisorSpec<R>, intensity: number, periodMillis: number): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), intensity, periodMillis }),
)

export const autoShutdown: {
  (autoShutdown: AutoShutdown): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, autoShutdown: AutoShutdown): SupervisorSpec<R>
} = dual(
  2,
  <R>(self: SupervisorSpec<R>, autoShutdown: AutoShutdown): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), autoShutdown }),
)

export const coolDown: {
  (millis: number): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, millis: number): SupervisorSpec<R>
} = dual(
  2,
  <R>(self: SupervisorSpec<R>, millis: number): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), coolDownMillis: millis }),
)

export const backoff: {
  (schedule: BackoffSchedule): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, schedule: BackoffSchedule): SupervisorSpec<R>
} = dual(
  2,
  <R>(self: SupervisorSpec<R>, schedule: BackoffSchedule): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), backoff: schedule }),
)

export interface DynamicOptions extends Omit<ChildOptions, 'significant'> {
  readonly ceiling: number
}

const dynamicKindOf = (options: DynamicOptions): DynamicKind => ({
  _tag: 'DynamicChildren',
  restartType: 'permanent',
  shutdown: WORKER_SHUTDOWN,
  startTimeoutMillis: 5_000,
  probeFailureThreshold: 2,
  ...options,
})

export const dynamic: {
  (options: DynamicOptions): <R>(self: SupervisorSpec<R>) => SupervisorSpec<R>
  <R>(self: SupervisorSpec<R>, options: DynamicOptions): SupervisorSpec<R>
} = dual(
  2,
  <R>(self: SupervisorSpec<R>, options: DynamicOptions): SupervisorSpec<R> =>
    specOf<R>({ ...partsOf(self), dynamic: dynamicKindOf(options) }),
)

export interface ChildOptions {
  readonly restartType?: ChildDeclaration['restartType']
  readonly shutdown?: ChildDeclaration['shutdown']
  readonly significant?: boolean
  readonly startTimeoutMillis?: number
}

const declarationOf = (
  childId: ChildId,
  nested: boolean,
  options: ChildOptions | undefined,
): ChildDeclaration => ({
  childId,
  restartType: 'permanent',
  shutdown: nested ? SUPERVISOR_SHUTDOWN : WORKER_SHUTDOWN,
  significant: false,
  startTimeoutMillis: 5_000,
  probeFailureThreshold: 2,
  ...options,
})

type FiberRunnable<R> =
  | BareFiberProgram
  | ((ready: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope | R>)

const isFiberRunnable = <R>(value: FiberChild<R>): value is FiberRunnable<R> =>
  typeof value === 'function' || Effect.isEffect(value)

const nestedProgramOf = <R>(
  nested: SupervisorSpec<R>,
): (ready: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope | R> =>
(ready) =>
  Effect.flatMap(
    nested.scoped,
    (handle) => Effect.andThen(ready, Effect.andThen(awaitTerminated(handle), Effect.interrupt)),
  )

const fiberMediumForChild = <R>(): Medium<
  (ready: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope | R>,
  never,
  Scope.Scope | R
> => mediumFor<R>()

const bindFiberChild = <R>(
  program: FiberRunnable<R>,
): Effect.Effect<BoundChild, never, Scope.Scope | R> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<Scope.Scope | R>()
    const runnable = typeof program === 'function' ? program : readyOnStart(program)
    return Binder.bind(runnable, fiberMediumForChild<R>(), context)
  })

const bindNestedChild = <R>(
  nested: SupervisorSpec<R>,
): Effect.Effect<BoundChild, never, Scope.Scope | R> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<Scope.Scope | R>()
    return Binder.bind(nestedProgramOf(nested), fiberMediumForChild<R>(), context)
  })

const childSpecMake = <R = never>(
  childId: ChildId,
  program: FiberChild<R>,
  options?: ChildOptions,
): ChildSpec<R> =>
  isFiberRunnable(program)
    ? { childId, declaration: declarationOf(childId, false, options), binding: bindFiberChild(program), ...Prototype }
    : { childId, declaration: declarationOf(childId, true, options), binding: bindNestedChild(program), ...Prototype }

const childSpecOn = <Program, StartError, R = never>(
  port: Context.Service<
    MediumPortShape<Program, StartError, Scope.Scope | R>,
    MediumPortShape<Program, StartError, Scope.Scope | R>
  >,
) =>
(
  childId: ChildId,
  program: Program,
  options?: ChildOptions,
): ChildSpec<MediumPortShape<Program, StartError, Scope.Scope | R> | R> => ({
  childId,
  declaration: declarationOf(childId, false, options),
  binding: Effect.gen(function*() {
    const shape = yield* port
    const context = yield* Effect.context<Scope.Scope | R>()
    return Binder.bind(program, shape.medium, context)
  }),
  ...Prototype,
})

/**
 * The two ways to declare a child: `make`, which binds to the fiber medium (and
 * to the `FiberMedium` port when one is provided), and `on`, which binds to a
 * named medium port (KTD9).
 */
export const ChildSpecs = {
  make: childSpecMake,
  on: childSpecOn,
} as const

export const children: {
  <R>(specs: ReadonlyArray<ChildSpec<R>>): <R2>(self: SupervisorSpec<R2>) => SupervisorSpec<R | R2>
  <R2, R>(self: SupervisorSpec<R2>, specs: ReadonlyArray<ChildSpec<R>>): SupervisorSpec<R | R2>
} = dual(
  2,
  <R2, R>(self: SupervisorSpec<R2>, specs: ReadonlyArray<ChildSpec<R>>): SupervisorSpec<R | R2> =>
    specOf<R | R2>({
      ...partsOf(self),
      declarations: [...self.declarations, ...specs.map((spec) => spec.declaration)],
      bindings: [
        ...self.bindings,
        ...specs.map((spec) => ({ declaration: spec.declaration, binding: spec.binding })),
      ],
    }),
)

export const child: {
  <R>(childId: ChildId, program: FiberChild<R>, options?: ChildOptions): <R2>(
    self: SupervisorSpec<R2>,
  ) => SupervisorSpec<R | R2>
  <R2, R>(
    self: SupervisorSpec<R2>,
    childId: ChildId,
    program: FiberChild<R>,
    options?: ChildOptions,
  ): SupervisorSpec<R | R2>
} = dual(
  (args) => isSupervisorSpec(args[0]),
  <R2, R>(
    self: SupervisorSpec<R2>,
    childId: ChildId,
    program: FiberChild<R>,
    options?: ChildOptions,
  ): SupervisorSpec<R | R2> => children(self, [childSpecMake(childId, program, options)]),
)
