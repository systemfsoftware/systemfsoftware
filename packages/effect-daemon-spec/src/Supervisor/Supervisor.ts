import { Effect, Layer, Match, Predicate, Queue, Ref, Scope } from 'effect'
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
import { type BareFiberProgram, type FiberProgram, readyOnStart } from './FiberMedium.js'
import type { Medium } from './Medium.js'
import {
  awaitTerminated,
  Handle,
  mailboxOf,
  offerEvent,
  type RunningSupervisor,
  shutdown,
  stateOf,
} from './running-supervisor.handle.js'
import { Commands } from './supervisor-commands.js'
import { Steps, type SupervisorStepCell, supervisorStepFor } from './supervisor-step.cell.js'

export const SpecTypeId = Symbol.for('@systemfsoftware/effect-daemon-spec/SupervisorSpec')
export type SpecTypeId = typeof SpecTypeId

export type ChildProgram = BareFiberProgram | FiberProgram | SupervisorSpec

export interface ChildSpec extends Pipeable {
  readonly childId: ChildId
  readonly declaration: ChildDeclaration
  readonly program: FiberProgram
}

interface SpecParts {
  readonly name: string
  readonly strategy: RestartStrategy
  readonly intensity: number
  readonly periodMillis: number
  readonly autoShutdown: AutoShutdown
  readonly coolDownMillis: number | undefined
  readonly backoff: BackoffSchedule
  readonly declarations: ReadonlyArray<ChildDeclaration>
  readonly programs: ReadonlyMap<ChildId, FiberProgram>
  readonly dynamic: DynamicKind
}

export interface SupervisorSpec extends Pipeable, SpecParts {
  readonly [SpecTypeId]: typeof SpecTypeId
  readonly scoped: Effect.Effect<RunningSupervisor, never, Scope.Scope>
  readonly layer: Layer.Layer<never>
}

const hasSpecTag = Predicate.hasProperty(SpecTypeId)

export const isSupervisorSpec = (value: unknown): value is SupervisorSpec =>
  hasSpecTag(value) && value[SpecTypeId] === SpecTypeId

const WORKER_SHUTDOWN: ChildDeclaration['shutdown'] = { _tag: 'Graceful', millis: 5_000 }

const SUPERVISOR_SHUTDOWN: ChildDeclaration['shutdown'] = { _tag: 'Infinity' }

const LIVENESS_TICK_MILLIS = 1_000

const policyOfParts = (parts: SpecParts): SupervisionPolicy =>
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

const scopedOf = (parts: SpecParts): Effect.Effect<RunningSupervisor, never, Scope.Scope> =>
  Effect.gen(function*() {
    const supervisorScope = yield* Effect.scope
    const initial: SupervisorState = new Running({ core: initialStateOf(policyOfParts(parts)) })
    const handle = yield* Handle.make(parts.name, initial, parts.programs)
    const medium: Medium<FiberProgram, never, Scope.Scope> = yield* Commands.mediumOf()
    const step = supervisorStepFor(Steps.runtimeOf({ handle }, medium))
    yield* Effect.forkIn(drainOf(handle, step), supervisorScope)
    yield* offerEvent(handle, { _tag: 'SupervisorStarted', at: 0 })
    yield* Effect.addFinalizer(() => shutdown(handle))
    return handle
  })

const specOf = (parts: SpecParts): SupervisorSpec => {
  const scoped = scopedOf(parts)
  return {
    [SpecTypeId]: SpecTypeId,
    ...parts,
    scoped,
    layer: Layer.effectDiscard(Effect.asVoid(scoped)),
    ...Prototype,
  }
}

const partsOf = (self: SupervisorSpec): SpecParts => ({
  name: self.name,
  strategy: self.strategy,
  intensity: self.intensity,
  periodMillis: self.periodMillis,
  autoShutdown: self.autoShutdown,
  coolDownMillis: self.coolDownMillis,
  backoff: self.backoff,
  declarations: self.declarations,
  programs: self.programs,
  dynamic: self.dynamic,
})

export const make = (name: string): SupervisorSpec =>
  specOf({
    name,
    strategy: 'one_for_one',
    intensity: 1,
    periodMillis: 5_000,
    autoShutdown: 'never',
    coolDownMillis: undefined,
    backoff: { baseMillis: 0, multiplier: 1, capMillis: 0 },
    declarations: [],
    programs: new Map(),
    dynamic: { _tag: 'NoDynamicChildren' },
  })

export const strategy: {
  (strategy: RestartStrategy): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, strategy: RestartStrategy): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, strategy: RestartStrategy): SupervisorSpec => specOf({ ...partsOf(self), strategy }),
)

export const intensity: {
  (intensity: number, periodMillis: number): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, intensity: number, periodMillis: number): SupervisorSpec
} = dual(
  3,
  (self: SupervisorSpec, intensity: number, periodMillis: number): SupervisorSpec =>
    specOf({ ...partsOf(self), intensity, periodMillis }),
)

export const autoShutdown: {
  (autoShutdown: AutoShutdown): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, autoShutdown: AutoShutdown): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, autoShutdown: AutoShutdown): SupervisorSpec => specOf({ ...partsOf(self), autoShutdown }),
)

export const coolDown: {
  (millis: number): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, millis: number): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, millis: number): SupervisorSpec => specOf({ ...partsOf(self), coolDownMillis: millis }),
)

export const backoff: {
  (schedule: BackoffSchedule): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, schedule: BackoffSchedule): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, schedule: BackoffSchedule): SupervisorSpec => specOf({ ...partsOf(self), backoff: schedule }),
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
  (options: DynamicOptions): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, options: DynamicOptions): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, options: DynamicOptions): SupervisorSpec =>
    specOf({ ...partsOf(self), dynamic: dynamicKindOf(options) }),
)

export interface ChildOptions {
  readonly restartType?: ChildDeclaration['restartType']
  readonly shutdown?: ChildDeclaration['shutdown']
  readonly significant?: boolean
  readonly startTimeoutMillis?: number
}

const defaultShutdownOf = (program: ChildProgram): ChildDeclaration['shutdown'] =>
  isSupervisorSpec(program) ? SUPERVISOR_SHUTDOWN : WORKER_SHUTDOWN

const declarationOf = (
  childId: ChildId,
  program: ChildProgram,
  options: ChildOptions | undefined,
): ChildDeclaration => ({
  childId,
  restartType: 'permanent',
  shutdown: defaultShutdownOf(program),
  significant: false,
  startTimeoutMillis: 5_000,
  probeFailureThreshold: 2,
  ...options,
})

const nestedProgramOf = (nested: SupervisorSpec): FiberProgram => (ready) =>
  Effect.flatMap(
    nested.scoped,
    (handle) => Effect.andThen(ready, Effect.andThen(awaitTerminated(handle), Effect.interrupt)),
  )

const declaredProgramOf = (program: BareFiberProgram | FiberProgram): FiberProgram =>
  typeof program === 'function' ? program : readyOnStart(program)

const programOfChild = (program: ChildProgram): FiberProgram =>
  isSupervisorSpec(program) ? nestedProgramOf(program) : declaredProgramOf(program)

export const ChildSpecs = {
  make: (childId: ChildId, program: ChildProgram, options?: ChildOptions): ChildSpec => ({
    childId,
    declaration: declarationOf(childId, program, options),
    program: programOfChild(program),
    ...Prototype,
  }),
} as const

export const children: {
  (specs: ReadonlyArray<ChildSpec>): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, specs: ReadonlyArray<ChildSpec>): SupervisorSpec
} = dual(
  2,
  (self: SupervisorSpec, specs: ReadonlyArray<ChildSpec>): SupervisorSpec =>
    specOf({
      ...partsOf(self),
      declarations: [...self.declarations, ...specs.map((spec) => spec.declaration)],
      programs: new Map([...self.programs, ...specs.map((spec) => [spec.childId, spec.program] as const)]),
    }),
)

export const child: {
  (childId: ChildId, program: ChildProgram, options?: ChildOptions): (self: SupervisorSpec) => SupervisorSpec
  (self: SupervisorSpec, childId: ChildId, program: ChildProgram, options?: ChildOptions): SupervisorSpec
} = dual(
  (args) => isSupervisorSpec(args[0]),
  (self: SupervisorSpec, childId: ChildId, program: ChildProgram, options?: ChildOptions): SupervisorSpec =>
    children(self, [ChildSpecs.make(childId, program, options)]),
)
