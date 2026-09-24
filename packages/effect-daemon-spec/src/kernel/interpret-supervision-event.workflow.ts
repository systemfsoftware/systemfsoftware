import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Number as Num, Option, Result, Schema } from 'effect'
import { SupervisionEvent } from './SupervisionEvent.schema.js'
import type { TimerKind } from './SupervisionEvent.schema.js'
import { Millis, PositiveMillis } from './SupervisionLimits.schema.js'
import type { EventTime, Generation, RequestId } from './SupervisionLimits.schema.js'
import { ChildId } from './SupervisionLimits.schema.js'
import { DecisionTypeId, StateTypeId } from './SupervisionTypeIds.js'
import { StopChild, SupervisorCommands } from './SupervisorCommand.schema.js'
import type {
  ArmChildTimer,
  ArmSupervisorTimer,
  ReplyStartAccepted,
  ReplyStartRefused,
  ReplyStopped,
  StartChild,
  SupervisorArm,
  SupervisorReply,
  TerminateSupervisor,
} from './SupervisorCommand.schema.js'
import type {
  BackoffSchedule,
  ChildDeclaration,
  DynamicChildren,
  RestartStrategy,
  RestartType,
  SupervisionPolicy,
} from './SupervisorPolicy.schema.js'
import type { ShutdownMode } from './SupervisorPolicy.schema.js'
import { ChildStart, SupervisorCore } from './SupervisorState.schema.js'
import { ChildInstance } from './SupervisorState.schema.js'
import { TerminationReason } from './TerminationReport.schema.js'

export class Stale extends Schema.TaggedClass<Stale>()('Stale', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class Continue extends Schema.TaggedClass<Continue>()('Continue', {
  core: SupervisorCore,
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class RestartChildren extends Schema.TaggedClass<RestartChildren>()('RestartChildren', {
  core: SupervisorCore,
  pending: Schema.Array(ChildStart),
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class StartChildren extends Schema.TaggedClass<StartChildren>()('StartChildren', {
  core: SupervisorCore,
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class CoolDown extends Schema.TaggedClass<CoolDown>()('CoolDown', {
  core: SupervisorCore,
  millis: PositiveMillis,
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class StopChildren extends Schema.TaggedClass<StopChildren>()('StopChildren', {
  core: SupervisorCore,
  reason: TerminationReason,
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class Terminate extends Schema.TaggedClass<Terminate>()('Terminate', {
  reason: TerminationReason,
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class RefuseDynamicStart extends Schema.TaggedClass<RefuseDynamicStart>()('RefuseDynamicStart', {
  commands: SupervisorCommands,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export const SupervisionDecision = Schema.Union([
  Stale,
  Continue,
  RestartChildren,
  StartChildren,
  CoolDown,
  StopChildren,
  Terminate,
  RefuseDynamicStart,
])
export type SupervisionDecision = typeof SupervisionDecision.Type

export class Running extends Schema.TaggedClass<Running>()('Running', { core: SupervisorCore }) {
  readonly [StateTypeId] = StateTypeId
}

export class Restarting extends Schema.TaggedClass<Restarting>()('Restarting', {
  core: SupervisorCore,
  pending: Schema.Array(ChildStart),
}) {
  readonly [StateTypeId] = StateTypeId
}

export class CoolingDown extends Schema.TaggedClass<CoolingDown>()('CoolingDown', {
  core: SupervisorCore,
  millis: PositiveMillis,
}) {
  readonly [StateTypeId] = StateTypeId
}

export class ShuttingDown extends Schema.TaggedClass<ShuttingDown>()('ShuttingDown', {
  core: SupervisorCore,
  reason: TerminationReason,
}) {
  readonly [StateTypeId] = StateTypeId
}

export class Terminated extends Schema.TaggedClass<Terminated>()('Terminated', { reason: TerminationReason }) {
  readonly [StateTypeId] = StateTypeId
}

export const SupervisorState = Schema.Union([Running, Restarting, CoolingDown, ShuttingDown, Terminated])
export type SupervisorState = typeof SupervisorState.Type

export class SupervisionStep extends Schema.TaggedClass<SupervisionStep>()('SupervisionStep', {
  state: SupervisorState,
  event: SupervisionEvent,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const UNKNOWN_TIMEOUT_MILLIS = 1_000

const noCommands: SupervisorCommands = { stops: [], starts: [], arms: [], replies: [], terminates: [] }

type CommandBuckets = {
  readonly stops?: ReadonlyArray<StopChild>
  readonly starts?: ReadonlyArray<StartChild>
  readonly arms?: ReadonlyArray<SupervisorArm>
  readonly replies?: ReadonlyArray<SupervisorReply>
  readonly terminates?: ReadonlyArray<TerminateSupervisor>
}

const commandsIn = (buckets: CommandBuckets): SupervisorCommands => ({ ...noCommands, ...buckets })

const reasonTagOf = (reason: TerminationReason): 'Normal' | 'Shutdown' | 'Abnormal' => reason._tag

const restartsOn = (restartType: RestartType, reason: TerminationReason): boolean =>
  Match.value(reasonTagOf(reason)).pipe(
    Match.when('Abnormal', () => restartType !== 'temporary'),
    Match.when('Normal', () => restartType === 'permanent'),
    Match.when('Shutdown', () => restartType === 'permanent'),
    Match.exhaustive,
  )

const incarnationMatches = (childId: ChildId, generation: Generation): (child: ChildInstance) => boolean => (child) =>
  [child.childId === childId, child.generation === generation].every((holds) => holds)

const planMatches = (childId: ChildId, generation: Generation): (plan: ChildStart) => boolean => (plan) =>
  [plan.childId === childId, plan.generation === generation].every((holds) => holds)

const currentIncarnation = (
  core: SupervisorCore,
  childId: ChildId,
  generation: Generation,
): Option.Option<ChildInstance> => Arr.findFirst(core.children, incarnationMatches(childId, generation))

const declarationOf = (policy: SupervisionPolicy, childId: ChildId): Option.Option<ChildDeclaration> =>
  Arr.findFirst(policy.childDeclarations, (declaration) => declaration.childId === childId)

const dynamicKindOf = (policy: SupervisionPolicy): Option.Option<DynamicChildren> =>
  Match.value(policy.dynamic).pipe(
    Match.tag('DynamicChildren', (dynamic) => Option.some(dynamic)),
    Match.tag('NoDynamicChildren', () => Option.none()),
    Match.exhaustive,
  )

type ChildKind = {
  readonly restartType: RestartType
  readonly shutdown: ShutdownMode
  readonly startTimeoutMillis: PositiveMillis
  readonly probeFailureThreshold: number
  readonly significant: boolean
}

const declaredKind = (declaration: ChildDeclaration): ChildKind => ({
  restartType: declaration.restartType,
  shutdown: declaration.shutdown,
  startTimeoutMillis: declaration.startTimeoutMillis,
  probeFailureThreshold: declaration.probeFailureThreshold,
  significant: declaration.significant,
})

const dynamicKindAs = (dynamic: DynamicChildren): ChildKind => ({
  restartType: dynamic.restartType,
  shutdown: dynamic.shutdown,
  startTimeoutMillis: dynamic.startTimeoutMillis,
  probeFailureThreshold: dynamic.probeFailureThreshold,
  significant: false,
})

const unknownKind: ChildKind = {
  restartType: 'temporary',
  shutdown: { _tag: 'Infinity' },
  startTimeoutMillis: UNKNOWN_TIMEOUT_MILLIS,
  probeFailureThreshold: 1,
  significant: false,
}

const fallbackKind = (policy: SupervisionPolicy): ChildKind =>
  Match.value(dynamicKindOf(policy)).pipe(
    Match.tag('Some', ({ value }) => dynamicKindAs(value)),
    Match.tag('None', () => unknownKind),
    Match.exhaustive,
  )

const kindOfPolicy = (policy: SupervisionPolicy, childId: ChildId): ChildKind =>
  Match.value(declarationOf(policy, childId)).pipe(
    Match.tag('Some', ({ value }) => declaredKind(value)),
    Match.tag('None', () => fallbackKind(policy)),
    Match.exhaustive,
  )

const indexOfChild = (core: SupervisorCore, childId: ChildId): Option.Option<number> =>
  Arr.findFirstIndex(core.children, (child) => child.childId === childId)

const scopeIndices = (strategy: RestartStrategy, failedIndex: number, total: number): ReadonlyArray<number> =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => [failedIndex]),
    Match.when('one_for_all', () => Arr.range(0, total - 1)),
    Match.when('rest_for_one', () => Arr.range(failedIndex, total - 1)),
    Match.exhaustive,
  )

const stoppingOf = (child: ChildInstance): ChildInstance => ({ ...child, status: 'stopping' })

const restartingOf = (child: ChildInstance, generation: Generation): ChildInstance => ({
  childId: child.childId,
  generation,
  status: 'starting',
  consecutiveRestarts: child.consecutiveRestarts + 1,
  probeFailures: 0,
})
const readiedOf = (child: ChildInstance): ChildInstance => ({
  childId: child.childId,
  generation: child.generation,
  status: 'ready',
  consecutiveRestarts: 0,
  probeFailures: 0,
})

const probedAs = (child: ChildInstance, alive: boolean): ChildInstance =>
  Match.value(alive).pipe(
    Match.when(true, () => ({ ...child, probeFailures: 0 })),
    Match.when(false, () => ({ ...child, probeFailures: child.probeFailures + 1 })),
    Match.exhaustive,
  )

const replacing = (next: ChildInstance): (child: ChildInstance) => ChildInstance => (child) =>
  Match.value(child.childId === next.childId).pipe(
    Match.when(true, () => next),
    Match.when(false, () => child),
    Match.exhaustive,
  )

const withChildren = (core: SupervisorCore, children: ReadonlyArray<ChildInstance>): SupervisorCore => ({
  ...core,
  children,
})

const withStamps = (core: SupervisorCore, restartStamps: ReadonlyArray<EventTime>): SupervisorCore => ({
  ...core,
  restartStamps,
})

const prunedStamps = (core: SupervisorCore, at: EventTime): ReadonlyArray<EventTime> =>
  Arr.filter(core.restartStamps, (stamp) => at - stamp <= core.policy.periodMillis)

const backoffDelay = (schedule: BackoffSchedule, consecutiveRestarts: number): Millis =>
  Match.value(schedule.baseMillis).pipe(
    Match.when(0, (): Millis => 0),
    Match.orElse((baseMillis) => Num.min(schedule.capMillis, baseMillis * schedule.multiplier ** consecutiveRestarts)),
  )

const startCommandOf = (start: ChildStart): StartChild => ({
  _tag: 'StartChild',
  childId: start.childId,
  generation: start.generation,
})

const stopCommandOf = (policy: SupervisionPolicy, child: ChildInstance): StopChild => ({
  _tag: 'StopChild',
  childId: child.childId,
  generation: child.generation,
  shutdown: kindOfPolicy(policy, child.childId).shutdown,
})

const backoffCommandOf = (start: ChildStart, deadline: EventTime): ArmChildTimer => ({
  _tag: 'ArmChildTimer',
  kind: 'backoff',
  childId: start.childId,
  generation: start.generation,
  deadline,
})

const deadlineCommandOf = (start: ChildStart, deadline: EventTime): ArmChildTimer => ({
  _tag: 'ArmChildTimer',
  kind: 'start_deadline',
  childId: start.childId,
  generation: start.generation,
  deadline,
})

const tickCommandOf = (child: ChildInstance, deadline: EventTime): ArmChildTimer => ({
  _tag: 'ArmChildTimer',
  kind: 'liveness_tick',
  childId: child.childId,
  generation: child.generation,
  deadline,
})

const coolDownCommandOf = (deadline: EventTime): ArmSupervisorTimer => ({
  _tag: 'ArmSupervisorTimer',
  kind: 'cool_down',
  deadline,
})

const terminateCommandOf = (reason: TerminationReason): TerminateSupervisor => ({
  _tag: 'TerminateSupervisor',
  reason,
})

const replyAcceptedOf = (requestId: RequestId, start: ChildStart): ReplyStartAccepted => ({
  _tag: 'ReplyStartAccepted',
  requestId,
  childId: start.childId,
  generation: start.generation,
})

const replyRefusedOf = (requestId: RequestId): ReplyStartRefused => ({ _tag: 'ReplyStartRefused', requestId })

const replyStoppedOf = (requestId: RequestId): ReplyStopped => ({ _tag: 'ReplyStopped', requestId })

const holdOf = (core: SupervisorCore): SupervisionDecision => new Continue({ core, commands: noCommands })

const terminatedReason: TerminationReason = { _tag: 'Shutdown' }

const stopEverything = (core: SupervisorCore, reason: TerminationReason): SupervisionDecision => {
  const stops = Arr.map(Arr.reverse(core.children), (child) => stopCommandOf(core.policy, child))
  return new StopChildren({
    core: withChildren(core, Arr.map(core.children, stoppingOf)),
    reason,
    commands: commandsIn({ stops }),
  })
}

type Termination = {
  readonly childId: ChildId
  readonly generation: Generation
  readonly reason: TerminationReason
  readonly at: EventTime
}

const terminationOf = (
  childId: ChildId,
  generation: Generation,
  reason: TerminationReason,
  at: EventTime,
): Termination => ({
  childId,
  generation,
  reason,
  at,
})

type RestartScope = {
  readonly coming: ReadonlyArray<ChildInstance>
  readonly comingIds: ReadonlyArray<ChildId>
  readonly removedIds: ReadonlyArray<ChildId>
  readonly remaining: ReadonlyArray<ChildInstance>
  readonly stops: ReadonlyArray<StopChild>
}

const restartScopeOf = (core: SupervisorCore, failedIndex: number, termination: Termination): RestartScope => {
  const group = Arr.getSomes(
    Arr.map(
      scopeIndices(core.policy.strategy, failedIndex, Arr.length(core.children)),
      (index) => Arr.get(core.children, index),
    ),
  )
  const coming = Arr.filter(
    group,
    (child) => restartsOn(kindOfPolicy(core.policy, child.childId).restartType, termination.reason),
  )
  const comingIds = Arr.map(coming, (child) => child.childId)
  const removed = Arr.filter(group, (child) => Arr.contains(comingIds, child.childId) === false)
  const removedIds = Arr.map(removed, (child) => child.childId)
  const remaining = Arr.filter(
    core.children,
    (child) => Arr.contains(removedIds, child.childId) === false,
  )
  const stops = Arr.map(Arr.reverse(group), (child) => stopCommandOf(core.policy, child))
  return {
    coming,
    comingIds,
    removedIds,
    remaining,
    stops,
  }
}

const restartedChildrenOf = (core: SupervisorCore, scope: RestartScope): ReadonlyArray<ChildInstance> =>
  Arr.flatMap(core.children, (child) =>
    Match.value(Arr.contains(scope.comingIds, child.childId)).pipe(
      Match.when(true, () => [restartingOf(child, child.generation + 1)]),
      Match.orElse(() => removalRemnant(scope.removedIds, child)),
    ))

const removalRemnant = (removedIds: ReadonlyArray<ChildId>, child: ChildInstance): ReadonlyArray<ChildInstance> =>
  Match.value(Arr.contains(removedIds, child.childId)).pipe(
    Match.when(true, (): ReadonlyArray<ChildInstance> => []),
    Match.orElse((): ReadonlyArray<ChildInstance> => [child]),
  )

type RestartStep = {
  readonly start: ChildStart
  readonly delay: Millis
}

const phasedCommands = (
  core: SupervisorCore,
  at: EventTime,
  coming: ReadonlyArray<ChildInstance>,
): { readonly commands: SupervisorCommands; readonly pending: ReadonlyArray<ChildStart> } => {
  const steps: ReadonlyArray<RestartStep> = Arr.map(coming, (child) => {
    const start: ChildStart = { childId: child.childId, generation: child.generation + 1 }
    return { start, delay: backoffDelay(core.policy.backoff, child.consecutiveRestarts) }
  })
  const ready = Arr.filter(steps, (step: RestartStep) => step.delay === 0)
  const deferred = Arr.filter(steps, (step: RestartStep) => step.delay > 0)
  const timeoutOf = (step: RestartStep): EventTime =>
    at + kindOfPolicy(core.policy, step.start.childId).startTimeoutMillis
  return {
    commands: commandsIn({
      starts: Arr.map(ready, (step: RestartStep) => startCommandOf(step.start)),
      arms: Arr.appendAll(
        Arr.map(ready, (step: RestartStep) => deadlineCommandOf(step.start, timeoutOf(step))),
        Arr.map(deferred, (step: RestartStep) => backoffCommandOf(step.start, at + step.delay)),
      ),
    }),
    pending: Arr.map(deferred, (step: RestartStep) => step.start),
  }
}

const exhaustedDecisionOf = (
  policy: SupervisionPolicy,
  core: SupervisorCore,
  stops: ReadonlyArray<StopChild>,
  at: EventTime,
): SupervisionDecision =>
  Match.value(policy.coolDown).pipe(
    Match.tag('CoolDownAfter', ({ millis }) =>
      new CoolDown({ core, millis, commands: commandsIn({ stops, arms: [coolDownCommandOf(at + millis)] }) })),
    Match.tag('NoCoolDown', () =>
      stopEverything(core, terminatedReason)),
    Match.exhaustive,
  )

const stampedCoreOf = (core: SupervisorCore, scope: RestartScope, at: EventTime): SupervisorCore => {
  const stamped = withStamps(core, [at, ...prunedStamps(core, at)])
  return withChildren(stamped, restartedChildrenOf(core, scope))
}

type RestartOutcome = {
  readonly core: SupervisorCore
  readonly stops: ReadonlyArray<StopChild>
  readonly pending: ReadonlyArray<ChildStart>
  readonly commands: SupervisorCommands
  readonly exhausted: boolean
}

const restartOutcomeOf = (core: SupervisorCore, scope: RestartScope, at: EventTime): RestartOutcome => {
  const nextCore = stampedCoreOf(core, scope, at)
  const phased = phasedCommands(core, at, scope.coming)
  return {
    core: nextCore,
    stops: scope.stops,
    pending: phased.pending,
    commands: commandsIn({ stops: scope.stops, starts: phased.commands.starts, arms: phased.commands.arms }),
    exhausted: Arr.length(nextCore.restartStamps) > nextCore.policy.intensity,
  }
}

const restartedDecisionOf = (core: SupervisorCore, outcome: RestartOutcome, at: EventTime): SupervisionDecision =>
  Match.value(outcome.exhausted).pipe(
    Match.when(true, () => exhaustedDecisionOf(core.policy, outcome.core, outcome.stops, at)),
    Match.when(false, () =>
      Match.value(Arr.length(outcome.pending) === 0).pipe(
        Match.when(true, () => new StartChildren({ core: outcome.core, commands: outcome.commands })),
        Match.when(false, () =>
          new RestartChildren({ core: outcome.core, pending: outcome.pending, commands: outcome.commands })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const isSignificant = (policy: SupervisionPolicy, child: ChildInstance): boolean =>
  Match.value(declarationOf(policy, child.childId)).pipe(
    Match.tag('Some', ({ value }) => value.significant),
    Match.tag('None', () => false),
    Match.exhaustive,
  )

const autoShutsDown = (
  policy: SupervisionPolicy,
  removed: ReadonlyArray<ChildInstance>,
  remaining: ReadonlyArray<ChildInstance>,
): boolean =>
  Match.value(policy.autoShutdown).pipe(
    Match.when('never', () => false),
    Match.when('any_significant', () => Arr.some(removed, (child) => isSignificant(policy, child))),
    Match.when('all_significant', () => Arr.every(remaining, (child) => isSignificant(policy, child) === false)),
    Match.exhaustive,
  )

const shutdownOrContinue = (
  core: SupervisorCore,
  removed: ReadonlyArray<ChildInstance>,
  remaining: ReadonlyArray<ChildInstance>,
): SupervisionDecision =>
  Match.value(autoShutsDown(core.policy, removed, remaining)).pipe(
    Match.when(true, () => stopEverything(withChildren(core, remaining), terminatedReason)),
    Match.when(false, () => new Continue({ core: withChildren(core, remaining), commands: noCommands })),
    Match.exhaustive,
  )
const RestartedBase = Schema.TaggedStruct('Restarted', {
  outcome: Schema.Struct({
    core: SupervisorCore,
    stops: Schema.Array(StopChild),
    pending: Schema.Array(ChildStart),
    commands: SupervisorCommands,
    exhausted: Schema.Boolean,
  }),
})
type RestartedBase = typeof RestartedBase.Type

const QuietBase = Schema.TaggedStruct('Quiet', {
  removedIds: Schema.Array(ChildId),
  remaining: Schema.Array(ChildInstance),
})
type QuietBase = typeof QuietBase.Type

type RestartSplit = RestartedBase | QuietBase

const failedChildOf = (core: SupervisorCore, failedIndex: number): Option.Option<ChildInstance> =>
  Arr.get(core.children, failedIndex)

const failedComesBack = (core: SupervisorCore, failedIndex: number, termination: Termination): boolean =>
  Match.value(failedChildOf(core, failedIndex)).pipe(
    Match.tag(
      'Some',
      (found) => restartsOn(kindOfPolicy(core.policy, found.value.childId).restartType, termination.reason),
    ),
    Match.tag('None', () => false),
    Match.exhaustive,
  )

const quietSplitOf = (core: SupervisorCore, failedIndex: number): RestartSplit =>
  Match.value(failedChildOf(core, failedIndex)).pipe(
    Match.tag('Some', (found): RestartSplit => ({
      _tag: 'Quiet',
      removedIds: [found.value.childId],
      remaining: Arr.filter(
        core.children,
        (child) => incarnationMatches(found.value.childId, found.value.generation)(child) === false,
      ),
    })),
    Match.tag('None', (): RestartSplit => ({ _tag: 'Quiet', removedIds: [], remaining: core.children })),
    Match.exhaustive,
  )

const restartSplitOf = (core: SupervisorCore, failedIndex: number, termination: Termination): RestartSplit =>
  Match.value(failedComesBack(core, failedIndex, termination)).pipe(
    Match.when(true, (): RestartSplit => ({
      _tag: 'Restarted',
      outcome: restartOutcomeOf(core, restartScopeOf(core, failedIndex, termination), termination.at),
    })),
    Match.when(false, (): RestartSplit => quietSplitOf(core, failedIndex)),
    Match.exhaustive,
  )

const terminatedIndexed = (core: SupervisorCore, failedIndex: number, termination: Termination): SupervisionDecision =>
  Match.value(restartSplitOf(core, failedIndex, termination)).pipe(
    Match.tag('Restarted', (restarted) => restartedDecisionOf(core, restarted.outcome, termination.at)),
    Match.tag('Quiet', (quiet) =>
      shutdownOrContinue(
        core,
        Arr.filter(core.children, (child) => Arr.contains(quiet.removedIds, child.childId)),
        quiet.remaining,
      )),
    Match.exhaustive,
  )

const terminatedCurrent = (
  core: SupervisorCore,
  child: ChildInstance,
  termination: Termination,
): SupervisionDecision =>
  Match.value(child.status).pipe(
    Match.when('stopping', () => removalContinue(core, termination)),
    Match.orElse(() =>
      Match.value(indexOfChild(core, child.childId)).pipe(
        Match.tag('Some', (index) => terminatedIndexed(core, index.value, termination)),
        Match.tag('None', () => new Stale({})),
        Match.exhaustive,
      )
    ),
  )

const removalOf = (core: SupervisorCore, childId: ChildId, generation: Generation): SupervisorCore =>
  withChildren(core, Arr.filter(core.children, (child) => incarnationMatches(childId, generation)(child) === false))

const removalContinue = (core: SupervisorCore, termination: Termination): SupervisionDecision =>
  new Continue({ core: removalOf(core, termination.childId, termination.generation), commands: noCommands })

const terminatedRunning = (core: SupervisorCore, event: {
  readonly childId: ChildId
  readonly generation: Generation
  readonly reason: TerminationReason
  readonly at: EventTime
}): SupervisionDecision =>
  Match.value(currentIncarnation(core, event.childId, event.generation)).pipe(
    Match.tag('None', () => new Stale({})),
    Match.tag('Some', (found) =>
      terminatedCurrent(core, found.value, terminationOf(event.childId, event.generation, event.reason, event.at))),
    Match.exhaustive,
  )

const startedInRunning = (
  core: SupervisorCore,
  childId: ChildId,
  generation: Generation,
): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('Some', () => holdOf(core)),
    Match.tag('None', () => new Stale({})),
    Match.exhaustive,
  )

const readyInRunning = (
  core: SupervisorCore,
  childId: ChildId,
  generation: Generation,
  at: EventTime,
): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('None', () => new Stale({})),
    Match.tag('Some', (found) => becomingReady(core, found.value, at)),
    Match.exhaustive,
  )

const becomingReady = (core: SupervisorCore, child: ChildInstance, at: EventTime): SupervisionDecision =>
  Match.value(child.status).pipe(
    Match.when('starting', () => {
      const next = readiedOf(child)
      const nextCore = withChildren(core, Arr.map(core.children, replacing(next)))
      return new Continue({
        core: nextCore,
        commands: commandsIn({ arms: [tickCommandOf(next, at + core.policy.livenessTickMillis)] }),
      })
    }),
    Match.orElse(() => holdOf(core)),
  )

const stoppedInShuttingDown = (
  core: SupervisorCore,
  reason: TerminationReason,
  childId: ChildId,
  generation: Generation,
): SupervisionDecision => {
  const next = removalOf(core, childId, generation)
  return Match.value(Arr.every(next.children, (child) => child.status !== 'stopping')).pipe(
    Match.when(
      true,
      () => new Terminate({ reason, commands: commandsIn({ terminates: [terminateCommandOf(reason)] }) }),
    ),
    Match.when(false, () => new Continue({ core: next, commands: noCommands })),
    Match.exhaustive,
  )
}

const probedInRunning = (
  core: SupervisorCore,
  childId: ChildId,
  generation: Generation,
  alive: boolean,
  at: EventTime,
): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('None', () => new Stale({})),
    Match.tag('Some', (found) => probedOutcomeOf(core, found.value, alive, at)),
    Match.exhaustive,
  )

const probedOutcomeOf = (
  core: SupervisorCore,
  child: ChildInstance,
  alive: boolean,
  at: EventTime,
): SupervisionDecision =>
  Match.value(child.status).pipe(
    Match.when('ready', () => probedReadyOutcomeOf(core, child, alive, at)),
    Match.orElse(() => holdOf(core)),
  )

const probedReadyOutcomeOf = (
  core: SupervisorCore,
  child: ChildInstance,
  alive: boolean,
  at: EventTime,
): SupervisionDecision =>
  Match.value(alive).pipe(
    Match.when(true, () =>
      new Continue({
        core: withChildren(core, Arr.map(core.children, replacing(probedAs(child, true)))),
        commands: noCommands,
      })),
    Match.when(false, () => failedProbeOutcomeOf(core, child, at)),
    Match.exhaustive,
  )

const failedProbeOutcomeOf = (core: SupervisorCore, child: ChildInstance, at: EventTime): SupervisionDecision =>
  Match.value(child.probeFailures + 1 >= kindOfPolicy(core.policy, child.childId).probeFailureThreshold).pipe(
    Match.when(true, () =>
      terminatedIndexed(
        core,
        Option.getOrThrow(indexOfChild(core, child.childId)),
        terminationOf(child.childId, child.generation, {
          _tag: 'Abnormal',
          report: { _tag: 'InferredReport', failedProbes: child.probeFailures + 1 },
        }, at),
      )),
    Match.when(
      false,
      () =>
        new Continue({
          core: withChildren(core, Arr.map(core.children, replacing(probedAs(child, false)))),
          commands: noCommands,
        }),
    ),
    Match.exhaustive,
  )

const namedTimerInRunning = (
  core: SupervisorCore,
  child: ChildInstance,
  kind: TimerKind,
  at: EventTime,
): SupervisionDecision =>
  Match.value(kind).pipe(
    Match.when('start_deadline', () => deadlineInRunning(core, child, at)),
    Match.when('liveness_tick', () => tickInRunning(core, child, at)),
    Match.when('backoff', () => new Stale({})),
    Match.when('cool_down', () => new Stale({})),
    Match.exhaustive,
  )

const deadlineInRunning = (core: SupervisorCore, child: ChildInstance, at: EventTime): SupervisionDecision =>
  Match.value(child.status).pipe(
    Match.when('starting', () =>
      terminatedIndexed(core, Option.getOrThrow(indexOfChild(core, child.childId)), {
        childId: child.childId,
        generation: child.generation,
        reason: {
          _tag: 'Abnormal',
          report: { _tag: 'DeadlineMissed', waitedMillis: kindOfPolicy(core.policy, child.childId).startTimeoutMillis },
        },
        at,
      })),
    Match.orElse(() => new Stale({})),
  )

const tickInRunning = (core: SupervisorCore, child: ChildInstance, at: EventTime): SupervisionDecision =>
  Match.value(child.status).pipe(
    Match.when(
      'ready',
      () =>
        new Continue({
          core,
          commands: commandsIn({ arms: [tickCommandOf(child, at + core.policy.livenessTickMillis)] }),
        }),
    ),
    Match.orElse(() => new Stale({})),
  )

const timerInRunning = (
  core: SupervisorCore,
  childId: ChildId,
  generation: Generation,
  kind: TimerKind,
  at: EventTime,
): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('None', () => new Stale({})),
    Match.tag('Some', (found) => namedTimerInRunning(core, found.value, kind, at)),
    Match.exhaustive,
  )

const fireBackoffOf = (
  core: SupervisorCore,
  pending: ReadonlyArray<ChildStart>,
  childId: ChildId,
  generation: Generation,
  at: EventTime,
): SupervisionDecision => {
  const start: ChildStart = { childId, generation }
  const remaining = Arr.filter(pending, (plan) => planMatches(childId, generation)(plan) === false)
  const commands: SupervisorCommands = commandsIn({
    starts: [startCommandOf(start)],
    arms: [deadlineCommandOf(start, at + kindOfPolicy(core.policy, childId).startTimeoutMillis)],
  })
  return Match.value(Arr.length(remaining) === 0).pipe(
    Match.when(true, () => new StartChildren({ core, commands })),
    Match.when(false, () => new RestartChildren({ core, pending: remaining, commands })),
    Match.exhaustive,
  )
}

const backoffInRestarting = (
  core: SupervisorCore,
  pending: ReadonlyArray<ChildStart>,
  childId: ChildId,
  generation: Generation,
  kind: TimerKind,
  at: EventTime,
): SupervisionDecision =>
  Match.value(kind).pipe(
    Match.when('backoff', () =>
      Match.value(Arr.findFirst(pending, planMatches(childId, generation))).pipe(
        Match.tag('None', () => new Stale({})),
        Match.tag('Some', () => fireBackoffOf(core, pending, childId, generation, at)),
        Match.exhaustive,
      )),
    Match.orElse(() => new Stale({})),
  )

const cooledStartsOf = (core: SupervisorCore, at: EventTime): {
  readonly fresh: ReadonlyArray<ChildInstance>
  readonly commands: SupervisorCommands
} => {
  const fresh: ReadonlyArray<ChildInstance> = Arr.map(core.children, (child) => ({
    ...child,
    status: 'starting',
    consecutiveRestarts: 0,
    probeFailures: 0,
  }))
  const deadlineOf = (child: ChildInstance): ArmChildTimer =>
    deadlineCommandOf(
      { childId: child.childId, generation: child.generation },
      at + kindOfPolicy(core.policy, child.childId).startTimeoutMillis,
    )
  return {
    fresh,
    commands: commandsIn({
      starts: Arr.map(fresh, (child) => startCommandOf({ childId: child.childId, generation: child.generation })),
      arms: Arr.map(fresh, deadlineOf),
    }),
  }
}

const cooledRestartOf = (core: SupervisorCore, at: EventTime): SupervisionDecision => {
  const starts = cooledStartsOf(core, at)
  const clearedStamps: ReadonlyArray<EventTime> = []
  const restarted: SupervisorCore = { ...core, children: starts.fresh, restartStamps: clearedStamps }
  return new StartChildren({ core: restarted, commands: starts.commands })
}

const runningDynamicCount = (core: SupervisorCore): number =>
  Arr.length(Arr.filter(core.children, (child) => child.status !== 'stopping'))

const isDeclaredChild = (core: SupervisorCore, childId: ChildId): boolean =>
  Option.isSome(declarationOf(core.policy, childId))

const dynamicIdOf = (core: SupervisorCore): ChildId => `d${core.nextOrdinal}`

const dynamicInstanceOf = (core: SupervisorCore): { readonly core: SupervisorCore; readonly start: ChildStart } => {
  const start: ChildStart = { childId: dynamicIdOf(core), generation: 0 }
  const instance: ChildInstance = {
    childId: start.childId,
    generation: start.generation,
    status: 'starting',
    consecutiveRestarts: 0,
    probeFailures: 0,
  }
  return {
    core: { ...core, children: Arr.append(core.children, instance), nextOrdinal: core.nextOrdinal + 1 },
    start,
  }
}

const allocatedDecisionOf = (
  core: SupervisorCore,
  allocated: { readonly core: SupervisorCore; readonly start: ChildStart },
  requestId: RequestId,
  at: EventTime,
): SupervisionDecision => {
  const timeoutMillis = Match.value(dynamicKindOf(allocated.core.policy)).pipe(
    Match.tag('Some', ({ value }) => value.startTimeoutMillis),
    Match.tag('None', () => UNKNOWN_TIMEOUT_MILLIS),
    Match.exhaustive,
  )
  return new StartChildren({
    core: allocated.core,
    commands: commandsIn({
      starts: [startCommandOf(allocated.start)],
      arms: [deadlineCommandOf(allocated.start, at + timeoutMillis)],
      replies: [replyAcceptedOf(requestId, allocated.start)],
    }),
  })
}

const ceilingAllows = (core: SupervisorCore, ceiling: number): boolean => runningDynamicCount(core) >= ceiling

const dynamicStartOf = (core: SupervisorCore, requestId: RequestId, at: EventTime): SupervisionDecision =>
  Match.value(dynamicKindOf(core.policy)).pipe(
    Match.tag('None', () => new RefuseDynamicStart({ commands: commandsIn({ replies: [replyRefusedOf(requestId)] }) })),
    Match.tag('Some', (dynamic) =>
      Match.value(ceilingAllows(core, dynamic.value.ceiling)).pipe(
        Match.when(true, () =>
          new RefuseDynamicStart({ commands: commandsIn({ replies: [replyRefusedOf(requestId)] }) })),
        Match.when(false, () =>
          allocatedDecisionOf(core, dynamicInstanceOf(core), requestId, at)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const dynamicStopOf = (
  core: SupervisorCore,
  requestId: RequestId,
  childId: ChildId,
  generation: Generation,
): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('None', () => new Stale({})),
    Match.tag('Some', (found) => dynamicStopCurrentOf(core, found.value, requestId)),
    Match.exhaustive,
  )

const stoppable = (core: SupervisorCore, child: ChildInstance): boolean =>
  Match.value(isDeclaredChild(core, child.childId)).pipe(
    Match.when(true, () => false),
    Match.when(false, () => child.status !== 'stopping'),
    Match.exhaustive,
  )

const stoppingContinue = (core: SupervisorCore, child: ChildInstance, requestId: RequestId): SupervisionDecision => {
  const next = stoppingOf(child)
  const nextCore = withChildren(core, Arr.map(core.children, replacing(next)))
  return new Continue({
    core: nextCore,
    commands: commandsIn({ stops: [stopCommandOf(core.policy, next)], replies: [replyStoppedOf(requestId)] }),
  })
}

const dynamicStopCurrentOf = (
  core: SupervisorCore,
  child: ChildInstance,
  requestId: RequestId,
): SupervisionDecision =>
  Match.value(stoppable(core, child)).pipe(
    Match.when(true, () => stoppingContinue(core, child, requestId)),
    Match.when(false, () => new Stale({})),
    Match.exhaustive,
  )

const onChildStarted = (state: SupervisorState, childId: ChildId, generation: Generation): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => startedInRunning(core, childId, generation)),
    Match.tag('Restarting', ({ core }) => holdOf(core)),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onChildReady = (
  state: SupervisorState,
  childId: ChildId,
  generation: Generation,
  at: EventTime,
): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => readyInRunning(core, childId, generation, at)),
    Match.tag('Restarting', ({ core }) => holdOf(core)),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onChildTerminated = (state: SupervisorState, termination: Termination): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) =>
      terminatedRunning(core, {
        childId: termination.childId,
        generation: termination.generation,
        reason: termination.reason,
        at: termination.at,
      })),
    Match.tag('Restarting', () => new Stale({})),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core }) => terminatedShuttingDown(core, ShuttingDownReasonOf(state), termination)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const ShuttingDownReasonOf = (state: SupervisorState): TerminationReason =>
  Match.value(state).pipe(
    Match.tag('ShuttingDown', ({ reason }) => reason),
    Match.orElse(() => terminatedReason),
  )

const terminatedShuttingDown = (
  core: SupervisorCore,
  reason: TerminationReason,
  termination: Termination,
): SupervisionDecision => stoppedInShuttingDown(core, reason, termination.childId, termination.generation)

const stoppedInRunning = (core: SupervisorCore, childId: ChildId, generation: Generation): SupervisionDecision =>
  Match.value(currentIncarnation(core, childId, generation)).pipe(
    Match.tag('Some', () => removalContinue(core, terminationOf(childId, generation, terminatedReason, 0))),
    Match.tag('None', () => new Stale({})),
    Match.exhaustive,
  )

const onChildStopped = (state: SupervisorState, childId: ChildId, generation: Generation): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => stoppedInRunning(core, childId, generation)),
    Match.tag('Restarting', () => new Stale({})),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core, reason }) => stoppedInShuttingDown(core, reason, childId, generation)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onProbeResult = (
  state: SupervisorState,
  childId: ChildId,
  generation: Generation,
  alive: boolean,
  at: EventTime,
): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => probedInRunning(core, childId, generation, alive, at)),
    Match.tag('Restarting', () => new Stale({})),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onTimerElapsed = (
  state: SupervisorState,
  kind: TimerKind,
  childId: ChildId,
  generation: Generation,
  at: EventTime,
): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => timerInRunning(core, childId, generation, kind, at)),
    Match.tag('Restarting', ({ core, pending }) =>
      Match.value(childId).pipe(
        Match.when('', () => new Stale({})),
        Match.orElse((named) => backoffInRestarting(core, pending, named, generation, kind, at)),
      )),
    Match.tag('CoolingDown', ({ core }) => coolDownElapsedOf(core, kind, at)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const coolDownElapsedOf = (core: SupervisorCore, kind: TimerKind, at: EventTime): SupervisionDecision =>
  Match.value(kind).pipe(
    Match.when('cool_down', () => cooledRestartOf(core, at)),
    Match.orElse(() => new Stale({})),
  )

const onDynamicStartRequested = (state: SupervisorState, requestId: RequestId, at: EventTime): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => dynamicStartOf(core, requestId, at)),
    Match.tag(
      'Restarting',
      () => new RefuseDynamicStart({ commands: commandsIn({ replies: [replyRefusedOf(requestId)] }) }),
    ),
    Match.tag(
      'CoolingDown',
      () => new RefuseDynamicStart({ commands: commandsIn({ replies: [replyRefusedOf(requestId)] }) }),
    ),
    Match.tag(
      'ShuttingDown',
      () => new RefuseDynamicStart({ commands: commandsIn({ replies: [replyRefusedOf(requestId)] }) }),
    ),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onDynamicStopRequested = (
  state: SupervisorState,
  requestId: RequestId,
  childId: ChildId,
  generation: Generation,
): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => dynamicStopOf(core, requestId, childId, generation)),
    Match.tag('Restarting', ({ core }) => holdOf(core)),
    Match.tag('CoolingDown', ({ core }) => holdOf(core)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const onShutdownRequested = (state: SupervisorState, reason: TerminationReason): SupervisionDecision =>
  Match.value(state).pipe(
    Match.tag('Running', ({ core }) => stopEverything(core, reason)),
    Match.tag('Restarting', ({ core }) => stopEverything(core, reason)),
    Match.tag('CoolingDown', ({ core }) => stopEverything(core, reason)),
    Match.tag('ShuttingDown', ({ core }) => holdOf(core)),
    Match.tag('Terminated', () => new Stale({})),
    Match.exhaustive,
  )

const decided = (state: SupervisorState, event: SupervisionEvent): SupervisionDecision =>
  Match.value(event).pipe(
    Match.tag('ChildStarted', (started) => onChildStarted(state, started.childId, started.generation)),
    Match.tag('ChildReady', (ready) => onChildReady(state, ready.childId, ready.generation, ready.at)),
    Match.tag('ChildTerminated', (terminated) =>
      onChildTerminated(
        state,
        terminationOf(terminated.childId, terminated.generation, terminated.reason, terminated.at),
      )),
    Match.tag('ChildStopped', (stopped) => onChildStopped(state, stopped.childId, stopped.generation)),
    Match.tag('ProbeResult', (probe) => onProbeResult(state, probe.childId, probe.generation, probe.alive, probe.at)),
    Match.tag('TimerElapsed', (elapsed) =>
      Match.value(elapsed.target).pipe(
        Match.tag(
          'ChildTimer',
          (target) => onTimerElapsed(state, elapsed.kind, target.childId, target.generation, elapsed.at),
        ),
        Match.tag('SupervisorTimer', () => onTimerElapsed(state, elapsed.kind, '', 0, elapsed.at)),
        Match.exhaustive,
      )),
    Match.tag(
      'DynamicStartRequested',
      (requested) => onDynamicStartRequested(state, requested.requestId, requested.at),
    ),
    Match.tag(
      'DynamicStopRequested',
      (requested) => onDynamicStopRequested(state, requested.requestId, requested.childId, requested.generation),
    ),
    Match.tag('ShutdownRequested', (requested) => onShutdownRequested(state, requested.reason)),
    Match.exhaustive,
  )

export const interpretSupervisionEvent = Workflow.make({
  command: SupervisionStep,
  decision: SupervisionDecision,
  error: Schema.Never,
  decide: (step): Result.Result<SupervisionDecision, never> => Result.succeed(decided(step.state, step.event)),
})
