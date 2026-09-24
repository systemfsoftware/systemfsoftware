import { it } from '@effect/vitest'
import { Array as Arr, Match, Number as Num, Option, Result, Schema } from 'effect'
import { evolveSupervisor, SupervisionEvolution } from '../kernel/evolve-supervisor.workflow.js'
import {
  CoolingDown,
  interpretSupervisionEvent,
  Restarting,
  Running,
  ShuttingDown,
  type SupervisionDecision,
  SupervisionStep,
  type SupervisorState,
} from '../kernel/interpret-supervision-event.workflow.js'
import { SupervisionEvent } from '../kernel/SupervisionEvent.schema.js'
import type { TimerKind } from '../kernel/SupervisionEvent.schema.js'
import {
  Ceiling,
  EventTime,
  Generation,
  Intensity,
  PositiveMillis,
  RestartCount,
} from '../kernel/SupervisionLimits.schema.js'
import type {
  ArmChildTimer,
  ArmSupervisorTimer,
  SupervisorArm,
  SupervisorCommand,
  SupervisorCommands,
  SupervisorReply,
} from '../kernel/SupervisorCommand.schema.js'
import { BackoffSchedule, RestartStrategy, RestartType, SupervisionPolicy } from '../kernel/SupervisorPolicy.schema.js'
import type { ChildDeclaration, CoolDownSetting, DynamicKind } from '../kernel/SupervisorPolicy.schema.js'
import { SupervisorCore } from '../kernel/SupervisorState.schema.js'
import type { ChildInstance, ChildStatus } from '../kernel/SupervisorState.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'

const CeilingWithinQuadraticFoldBudget = Ceiling.pipe(Schema.check(Schema.isLessThanOrEqualTo(32)))

const PERIOD_MILLIS = 100

// The test-side oracle for R8's schedule: mathematically min(cap, base * multiplier**k)
// with 0 * multiplier**k read as 0 — the float 0 * Infinity = NaN is an artifact, not a
// delay.
const backoffDelayAt = (schedule: BackoffSchedule, k: number): number =>
  Match.value(schedule.baseMillis).pipe(
    Match.when(0, () => 0),
    Match.orElse((baseMillis) => Num.min(schedule.capMillis, baseMillis * schedule.multiplier ** k)),
  )

type AutoShutdown = 'never' | 'any_significant' | 'all_significant'

type PolicyParts = {
  readonly strategy: RestartStrategy
  readonly intensity?: number
  readonly childDeclarations: ReadonlyArray<ChildDeclaration>
  readonly coolDown?: CoolDownSetting
  readonly backoff?: BackoffSchedule
  readonly dynamic?: DynamicKind
  readonly autoShutdown?: AutoShutdown | undefined
}

const policyWith = (parts: PolicyParts): SupervisionPolicy => {
  const decoded = Schema.decodeResult(SupervisionPolicy)({
    strategy: parts.strategy,
    intensity: parts.intensity ?? 8,
    periodMillis: PERIOD_MILLIS,
    autoShutdown: parts.autoShutdown ?? 'never',
    coolDown: parts.coolDown ?? { _tag: 'NoCoolDown' },
    backoff: parts.backoff ?? { baseMillis: 0, multiplier: 2, capMillis: 0 },
    dynamic: parts.dynamic ?? { _tag: 'NoDynamicChildren' },
    livenessTickMillis: 10,
    childDeclarations: parts.childDeclarations,
  })
  return Result.getOrThrow(decoded)
}

const declaredChild = (childId: string, restartType: RestartType, significant: boolean): ChildDeclaration => ({
  childId,
  restartType,
  shutdown: { _tag: 'Graceful', millis: 20 },
  significant,
  startTimeoutMillis: 50,
  probeFailureThreshold: 2,
})

const childOf = (childId: string, generation: number, status: ChildStatus): ChildInstance => ({
  childId,
  generation,
  status,
  consecutiveRestarts: 0,
  probeFailures: 0,
})

const coreWith = (
  policy: SupervisionPolicy,
  children: ReadonlyArray<ChildInstance>,
  restartStamps: ReadonlyArray<number>,
): SupervisorCore => ({ policy, children, restartStamps, nextOrdinal: 0 })

const runningOf = (core: SupervisorCore): SupervisorState => new Running({ core })

const abnormalOf = (cause: string): TerminationReason => ({
  _tag: 'Abnormal',
  report: { _tag: 'CauseReport', cause },
})

const terminatedEvent = (
  childId: string,
  generation: number,
  at: EventTime,
  reason: TerminationReason,
): SupervisionEvent => ({ _tag: 'ChildTerminated', at, childId, generation, reason })

const normalExitOf = (childId: string, generation: number, at: EventTime): SupervisionEvent =>
  terminatedEvent(childId, generation, at, { _tag: 'Normal' })

const stoppedEvent = (childId: string, generation: number, at: EventTime): SupervisionEvent => ({
  _tag: 'ChildStopped',
  at,
  childId,
  generation,
})

const readyEventOf = (childId: string, generation: number, at: EventTime): SupervisionEvent => ({
  _tag: 'ChildReady',
  at,
  childId,
  generation,
})

const probedEventOf = (childId: string, generation: number, at: EventTime): SupervisionEvent => ({
  _tag: 'ProbeResult',
  at,
  childId,
  generation,
  alive: true,
})

const childTimerEvent = (kind: TimerKind, childId: string, generation: number, at: EventTime): SupervisionEvent => ({
  _tag: 'TimerElapsed',
  at,
  kind,
  target: { _tag: 'ChildTimer', childId, generation },
})

const supervisorTimerEvent = (kind: TimerKind, at: EventTime): SupervisionEvent => ({
  _tag: 'TimerElapsed',
  at,
  kind,
  target: { _tag: 'SupervisorTimer' },
})

const dynamicStartEvent = (requestId: string, at: EventTime): SupervisionEvent => ({
  _tag: 'DynamicStartRequested',
  at,
  requestId,
})

const dynamicStopEvent = (
  requestId: string,
  childId: string,
  generation: number,
  at: EventTime,
): SupervisionEvent => ({ _tag: 'DynamicStopRequested', at, requestId, childId, generation })

const unbornEvent = (
  tag: 'ChildTerminated' | 'ChildReady' | 'ChildStopped' | 'ProbeResult',
  childId: string,
  generation: number,
  at: EventTime,
): SupervisionEvent =>
  Match.value(tag).pipe(
    Match.when('ChildTerminated', (): SupervisionEvent => terminatedEvent(childId, generation, at, abnormalOf('boom'))),
    Match.when('ChildReady', (): SupervisionEvent => readyEventOf(childId, generation, at)),
    Match.when('ChildStopped', (): SupervisionEvent => stoppedEvent(childId, generation, at)),
    Match.when('ProbeResult', (): SupervisionEvent => probedEventOf(childId, generation, at)),
    Match.exhaustive,
  )

const stepOf = (state: SupervisorState, event: SupervisionEvent): SupervisionStep =>
  new SupervisionStep({ state, event })

const decidedOf = (step: SupervisionStep): SupervisionDecision => Result.getOrThrow(interpretSupervisionEvent(step))

const evolvedOf = (state: SupervisorState, decision: SupervisionDecision): SupervisorState =>
  Result.getOrThrow(evolveSupervisor(new SupervisionEvolution({ state, decision })))

type Folded = {
  readonly state: SupervisorState
  readonly decisions: ReadonlyArray<SupervisionDecision>
}

const folded = (state: SupervisorState, events: ReadonlyArray<SupervisionEvent>): Folded => {
  const seed: Folded = { state, decisions: [] }
  return Arr.reduce(events, seed, (acc, event) => {
    const decision = decidedOf(stepOf(acc.state, event))
    return { state: evolvedOf(acc.state, decision), decisions: Arr.append(acc.decisions, decision) }
  })
}

const lastDecisionOf = (outcome: Folded): SupervisionDecision => Option.getOrThrow(Arr.last(outcome.decisions))

const noCommands: SupervisorCommands = { stops: [], starts: [], arms: [], replies: [], terminates: [] }

const commandsOf = (decision: SupervisionDecision): SupervisorCommands =>
  Match.value(decision).pipe(
    Match.tag('Stale', () => noCommands),
    Match.tag('RefuseDynamicStart', (refused) => refused.commands),
    Match.tag('Terminate', (terminated) => terminated.commands),
    Match.tag('Continue', (continued) => continued.commands),
    Match.tag('RestartChildren', (restarted) => restarted.commands),
    Match.tag('StartChildren', (started) => started.commands),
    Match.tag('CoolDown', (cooled) => cooled.commands),
    Match.tag('StopChildren', (stopped) => stopped.commands),
    Match.exhaustive,
  )

const coreOf = (decision: SupervisionDecision): Option.Option<SupervisorCore> =>
  Match.value(decision).pipe(
    Match.tag('Stale', () => Option.none<SupervisorCore>()),
    Match.tag('RefuseDynamicStart', () => Option.none<SupervisorCore>()),
    Match.tag('Terminate', () => Option.none<SupervisorCore>()),
    Match.tag('Continue', (continued) => Option.some(continued.core)),
    Match.tag('RestartChildren', (restarted) => Option.some(restarted.core)),
    Match.tag('StartChildren', (started) => Option.some(started.core)),
    Match.tag('CoolDown', (cooled) => Option.some(cooled.core)),
    Match.tag('StopChildren', (stopped) => Option.some(stopped.core)),
    Match.exhaustive,
  )
const flattenOf = (commands: SupervisorCommands): ReadonlyArray<SupervisorCommand> => [
  ...commands.stops,
  ...commands.starts,
  ...commands.arms,
  ...commands.replies,
  ...commands.terminates,
]

const stopIdsOf = (commands: SupervisorCommands): ReadonlyArray<string> =>
  Arr.map(commands.stops, (stop) => stop.childId)

const startIdsOf = (commands: SupervisorCommands): ReadonlyArray<string> =>
  Arr.map(commands.starts, (start) => start.childId)

const acceptedIdOf = (reply: SupervisorReply): Option.Option<string> =>
  Match.value(reply).pipe(
    Match.tag('ReplyStartAccepted', (accepted) => Option.some(accepted.childId)),
    Match.orElse(() => Option.none()),
  )

const acceptedIdsOf = (commands: SupervisorCommands): ReadonlyArray<string> =>
  Arr.getSomes(Arr.map(commands.replies, acceptedIdOf))

const terminatorCountOf = (commands: SupervisorCommands): number => Arr.length(commands.terminates)

const backoffTimerOf = (arm: SupervisorArm): Option.Option<ArmChildTimer> =>
  Match.value(arm).pipe(
    Match.tag('ArmChildTimer', (armed) =>
      Match.value(armed.kind).pipe(
        Match.when('backoff', () => Option.some(armed)),
        Match.orElse(() => Option.none<ArmChildTimer>()),
      )),
    Match.orElse(() => Option.none()),
  )

const coolDownTimerOf = (arm: SupervisorArm): Option.Option<ArmSupervisorTimer> =>
  Match.value(arm).pipe(
    Match.tag('ArmSupervisorTimer', (armed) =>
      Match.value(armed.kind).pipe(
        Match.when('cool_down', () => Option.some(armed)),
        Match.orElse(() => Option.none<ArmSupervisorTimer>()),
      )),
    Match.orElse(() => Option.none()),
  )

const backoffDeadlineOf = (
  commands: SupervisorCommands,
  childId: string,
  generation: number,
): Option.Option<EventTime> => {
  const armed = Arr.findFirst(
    commands.arms,
    (arm) =>
      Match.value(backoffTimerOf(arm)).pipe(
        Match.tag('Some', (timer) => timer.value.childId === childId && timer.value.generation === generation),
        Match.tag('None', () => false),
        Match.exhaustive,
      ),
  )
  return Option.flatMap(armed, (arm) => Option.map(backoffTimerOf(arm), (timer) => timer.deadline))
}

const coolDownDeadlineOf = (commands: SupervisorCommands): Option.Option<EventTime> => {
  const armed = Arr.findFirst(commands.arms, (arm) => Option.isSome(coolDownTimerOf(arm)))
  return Option.flatMap(armed, (arm) => Option.map(coolDownTimerOf(arm), (timer) => timer.deadline))
}

const isReplyStopped = (reply: SupervisorReply): boolean =>
  Match.value(reply).pipe(
    Match.tag('ReplyStopped', () => true),
    Match.orElse(() => false),
  )

const repliesStopped = (decision: SupervisionDecision): boolean =>
  Arr.some(commandsOf(decision).replies, isReplyStopped)

const deadlineIs = (deadline: Option.Option<EventTime>, expected: number): boolean =>
  Match.value(deadline).pipe(
    Match.tag('Some', (some) => some.value === expected),
    Match.tag('None', () => false),
    Match.exhaustive,
  )

const isStaleDecision = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('Stale', () => true),
    Match.orElse(() => false),
  )

const isStopChildren = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('StopChildren', () => true),
    Match.orElse(() => false),
  )

const terminatesOnce = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('Terminate', (terminated) =>
      Arr.length(terminated.commands.terminates) === 1 && Arr.length(terminated.commands.stops) === 0),
    Match.orElse(() =>
      false
    ),
  )

const isStartChildren = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('StartChildren', () => true),
    Match.orElse(() => false),
  )

const isCoolDown = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('CoolDown', () => true),
    Match.orElse(() => false),
  )

const isRefusal = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('RefuseDynamicStart', () => true),
    Match.orElse(() => false),
  )

const isRestartFamily = (decision: SupervisionDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('RestartChildren', () => true),
    Match.tag('StartChildren', () => true),
    Match.orElse(() => false),
  )

const hasNoCommands = (decision: SupervisionDecision): boolean => {
  const commands = commandsOf(decision)
  return Arr.length(commands.stops) === 0 &&
    Arr.length(commands.starts) === 0 &&
    Arr.length(commands.arms) === 0 &&
    Arr.length(commands.replies) === 0 &&
    Arr.length(commands.terminates) === 0
}

const rankOf = (command: SupervisorCommand): number =>
  Match.value(command).pipe(
    Match.tag('StopChild', () => 0),
    Match.tag('StartChild', () => 1),
    Match.tag('ArmChildTimer', () => 2),
    Match.tag('ArmSupervisorTimer', () => 2),
    Match.tag('ReplyStartAccepted', () => 3),
    Match.tag('ReplyStartRefused', () => 3),
    Match.tag('ReplyStopped', () => 3),
    Match.tag('TerminateSupervisor', () => 4),
    Match.exhaustive,
  )

const ranksAscend = (commands: SupervisorCommands): boolean =>
  Arr.every(
    Arr.zip(Arr.map(flattenOf(commands), rankOf), Arr.drop(Arr.map(flattenOf(commands), rankOf), 1)),
    ([left, right]) => left <= right,
  )

const noStopAfterStart = (commands: SupervisorCommands): boolean =>
  Arr.reduce(flattenOf(commands), { seenStart: false, valid: true }, (acc, command) => ({
    seenStart: acc.seenStart || rankOf(command) === 1,
    valid: acc.valid && (acc.seenStart === false || rankOf(command) !== 0),
  })).valid

const sameSeq = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  Arr.join(left, '|') === Arr.join(right, '|')

const textOf = (items: ReadonlyArray<string | number>): ReadonlyArray<string> => Arr.map(items, (item) => `${item}`)

const idSeqOf = (children: ReadonlyArray<ChildInstance>): ReadonlyArray<string> =>
  Arr.map(children, (child) => child.childId)

const labelOf = (child: ChildInstance): string => `${child.childId}:${child.generation}:${child.status}`

const startIdsFromDecision = (decision: SupervisionDecision): ReadonlyArray<string> =>
  Match.value(decision).pipe(
    Match.tag('StartChildren', (started) => acceptedIdsOf(started.commands)),
    Match.orElse((): ReadonlyArray<string> => []),
  )

/** R1/R2: the group one terminating incarnation puts into play, and who of it comes back. */
const otpGroup = (strategy: RestartStrategy, failedIndex: number, total: number): ReadonlyArray<number> =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => [failedIndex]),
    Match.when('one_for_all', () => Arr.range(0, total - 1)),
    Match.when('rest_for_one', () => Arr.range(failedIndex, total - 1)),
    Match.exhaustive,
  )

it.prop(
  '∀s_RestartSet_=OtpGroup',
  [RestartStrategy, RestartType, RestartType, RestartType, EventTime],
  ([strategy, first, second, third, at]) => {
    const typeAt = (index: number): RestartType =>
      Match.value(index).pipe(
        Match.when(0, () => first),
        Match.when(1, () => second),
        Match.orElse(() => third),
      )
    const comesBack = (restartType: RestartType): boolean => restartType !== 'temporary'
    const childAt = (index: number): ChildInstance => childOf(`c${index}`, index + 3, 'ready')
    const groupIds = Arr.map(otpGroup(strategy, 1, 3), (index) => `c${index}`)
    const failedRestarts = comesBack(typeAt(1))
    const comingIndices = Match.value(failedRestarts).pipe(
      Match.when(true, () => Arr.filter(otpGroup(strategy, 1, 3), (index) => comesBack(typeAt(index)))),
      Match.when(false, (): ReadonlyArray<number> => []),
      Match.exhaustive,
    )
    const comingIds = Arr.map(comingIndices, (index) => `c${index}`)
    const expectedLabels = Arr.map(comingIndices, (index) => `c${index}:${childAt(index).generation + 1}:starting`)

    const tree = [childAt(0), childAt(1), childAt(2)]
    const declarations = Arr.map(
      [typeAt(0), typeAt(1), typeAt(2)],
      (restartType, index) => declaredChild(`c${index}`, restartType, false),
    )
    const state = runningOf(coreWith(policyWith({ strategy, childDeclarations: declarations }), tree, []))
    const failed = childAt(1)
    const decision = decidedOf(
      stepOf(state, terminatedEvent(failed.childId, failed.generation, at, abnormalOf('boom'))),
    )

    return Match.value(failedRestarts).pipe(
      Match.when(false, () =>
        Match.value(decision).pipe(
          Match.tag('Continue', (continued) =>
            hasNoCommands(decision) &&
            sameSeq(idSeqOf(continued.core.children), ['c0', 'c2']) &&
            sameSeq(textOf(continued.core.restartStamps), [])),
          Match.orElse(() => false),
        )),
      Match.when(true, () =>
        Match.value(isRestartFamily(decision)).pipe(
          Match.when(true, () =>
            Match.value(coreOf(decision)).pipe(
              Match.tag('Some', ({ value }) =>
                sameSeq(stopIdsOf(commandsOf(decision)), Arr.reverse(groupIds)) &&
                sameSeq(startIdsOf(commandsOf(decision)), comingIds) &&
                sameSeq(textOf(value.restartStamps), textOf([at])) &&
                sameSeq(
                  Arr.map(
                    Arr.filter(value.children, (child) => Arr.contains(comingIds, child.childId)),
                    labelOf,
                  ),
                  expectedLabels,
                )),
              Match.tag('None', () => false),
              Match.exhaustive,
            )),
          Match.when(false, () => false),
          Match.exhaustive,
        )),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀r_TransientExit_⊥Restart',
  [Schema.Literals(['Normal', 'Shutdown']), EventTime],
  ([tag, at]) => {
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [declaredChild('c0', 'transient', false)],
    })
    const state = runningOf(coreWith(policy, [childOf('c0', 2, 'ready')], [at]))
    const decision = decidedOf(stepOf(state, terminatedEvent('c0', 2, at, { _tag: tag })))

    return Match.value(decision).pipe(
      Match.tag('Continue', (continued) =>
        hasNoCommands(decision) &&
        sameSeq(idSeqOf(continued.core.children), []) &&
        sameSeq(textOf(continued.core.restartStamps), textOf([at]))),
      Match.orElse(() => false),
    )
  },
)

it.prop(
  '∀n_Exhaustion_=LimitPlus1',
  [Intensity, EventTime],
  ([intensity, at0]) => {
    const t0 = at0
    const policy = policyWith({
      strategy: 'one_for_one',
      intensity,
      childDeclarations: [declaredChild('c0', 'permanent', false)],
    })
    const terminationAt = (index: number): SupervisionEvent =>
      terminatedEvent('c0', index, t0 + index, abnormalOf('boom'))
    const start = runningOf(coreWith(policy, [childOf('c0', 0, 'ready')], []))
    const outcome = folded(start, Arr.makeBy(intensity + 1, terminationAt))

    const tolerated = Arr.every(Arr.take(outcome.decisions, intensity), isRestartFamily)
    const exhausted = isStopChildren(lastDecisionOf(outcome))
    const confirmed = folded(outcome.state, [stoppedEvent('c0', intensity + 1, t0 + intensity + 1)])
    const finalized = Match.value(lastDecisionOf(confirmed)).pipe(
      Match.tag('Terminate', (terminated) => terminatorCountOf(terminated.commands) === 1),
      Match.orElse(() => false),
    )

    return tolerated && exhausted && finalized
  },
)

it.prop(
  '∀m_CoolDown_=Rearm',
  [PositiveMillis, EventTime],
  ([millis, at0]) => {
    const t0 = at0
    const policy = policyWith({
      strategy: 'one_for_one',
      intensity: 1,
      coolDown: { _tag: 'CoolDownAfter', millis },
      childDeclarations: [declaredChild('c0', 'permanent', false)],
    })
    const start = runningOf(coreWith(policy, [childOf('c0', 0, 'ready')], []))
    const first = folded(start, [terminatedEvent('c0', 0, t0, abnormalOf('boom'))])
    const second = folded(first.state, [terminatedEvent('c0', 1, t0 + 1, abnormalOf('boom'))])

    const armed = isCoolDown(lastDecisionOf(second)) &&
      deadlineIs(coolDownDeadlineOf(commandsOf(lastDecisionOf(second))), t0 + 1 + millis)

    const resumed = folded(second.state, [supervisorTimerEvent('cool_down', t0 + 1 + millis)])
    const restarted = Match.value(lastDecisionOf(resumed)).pipe(
      Match.tag('StartChildren', (decision) =>
        Match.value(coreOf(decision)).pipe(
          Match.tag('Some', ({ value }) =>
            sameSeq(textOf(value.restartStamps), []) && sameSeq(startIdsOf(decision.commands), ['c0'])),
          Match.tag('None', () =>
            false),
          Match.exhaustive,
        )),
      Match.orElse(() => false),
    )

    const afterReset = folded(resumed.state, [
      terminatedEvent('c0', 2, t0 + 1 + millis + 1, abnormalOf('boom')),
    ])

    return armed && restarted && isRestartFamily(lastDecisionOf(afterReset))
  },
)

it.prop(
  '∀g_WindowPrune_≡Period',
  [PositiveMillis, EventTime],
  ([gap, at0]) => {
    const t0 = at0
    const policy = policyWith({
      strategy: 'one_for_one',
      intensity: 1,
      childDeclarations: [declaredChild('c0', 'permanent', false)],
    })
    const start = runningOf(coreWith(policy, [childOf('c0', 0, 'ready')], []))
    const first = folded(start, [terminatedEvent('c0', 0, t0, abnormalOf('boom'))])
    const second = folded(first.state, [terminatedEvent('c0', 1, t0 + gap, abnormalOf('boom'))])

    return isStopChildren(lastDecisionOf(second)) === (gap <= PERIOD_MILLIS)
  },
)

it.prop(
  '∀g_OneForAll_=OneStamp',
  [EventTime, Generation],
  ([at, generation]) => {
    const gen = generation
    const policy = policyWith({
      strategy: 'one_for_all',
      childDeclarations: [
        declaredChild('c0', 'permanent', false),
        declaredChild('c1', 'permanent', false),
        declaredChild('c2', 'permanent', false),
      ],
    })
    const children = Arr.map(['c0', 'c1', 'c2'], (childId) => childOf(childId, gen, 'ready'))
    const decision = decidedOf(
      stepOf(runningOf(coreWith(policy, children, [])), terminatedEvent('c1', gen, at, abnormalOf('boom'))),
    )
    const stamped = Match.value(coreOf(decision)).pipe(
      Match.tag('Some', ({ value }) => sameSeq(textOf(value.restartStamps), textOf([at]))),
      Match.tag('None', () => false),
      Match.exhaustive,
    )

    return isRestartFamily(decision) && stamped &&
      Arr.length(stopIdsOf(commandsOf(decision))) === 3 &&
      Arr.length(startIdsOf(commandsOf(decision))) === 3
  },
)

it.prop(
  '∀s_AnySignificant_=Shutdown',
  [EventTime],
  ([at]) => {
    const policy = policyWith({
      strategy: 'one_for_all',
      autoShutdown: 'any_significant',
      childDeclarations: [declaredChild('c0', 'transient', true), declaredChild('c1', 'permanent', false)],
    })
    const state = runningOf(coreWith(policy, [childOf('c0', 4, 'ready'), childOf('c1', 6, 'ready')], []))
    const outcome = folded(state, [normalExitOf('c0', 4, at)])

    return Match.value(lastDecisionOf(outcome)).pipe(
      Match.tag('StopChildren', (stopped) =>
        sameSeq(stopIdsOf(stopped.commands), ['c1']) &&
        sameSeq(idSeqOf(stopped.core.children), ['c1']) &&
        sameSeq(textOf(stopped.core.restartStamps), [])),
      Match.orElse(() => false),
    )
  },
)

it.prop(
  '∀s_AllSignificant_=LastOne',
  [EventTime],
  ([at]) => {
    const t0 = at
    const policy = policyWith({
      strategy: 'one_for_one',
      autoShutdown: 'all_significant',
      childDeclarations: [declaredChild('c0', 'transient', true), declaredChild('c1', 'transient', true)],
    })
    const state = runningOf(coreWith(policy, [childOf('c0', 4, 'ready'), childOf('c1', 6, 'ready')], []))
    const first = folded(state, [normalExitOf('c0', 4, t0)])
    const second = folded(first.state, [normalExitOf('c1', 6, t0 + 1)])

    return Match.value(lastDecisionOf(first)).pipe(
      Match.tag('Continue', (continued) =>
        hasNoCommands(continued) &&
        sameSeq(idSeqOf(continued.core.children), ['c1'])),
      Match.orElse(() => false),
    ) && terminatesOnce(lastDecisionOf(second))
  },
)

it.prop(
  '∀t_EmptyTreeShutdown_=Terminate',
  [RestartStrategy, EventTime],
  ([strategy, at]) => {
    const policy = policyWith({ strategy, childDeclarations: [] })
    const outcome = folded(runningOf(coreWith(policy, [], [])), [
      { _tag: 'ShutdownRequested', at, reason: { _tag: 'Shutdown' } },
    ])
    return terminatesOnce(lastDecisionOf(outcome))
  },
)

it.prop(
  '∀d_DeadlineMiss_=Abnormal',
  [RestartStrategy, EventTime, Generation],
  ([strategy, at, generation]) => {
    const gen = generation
    const policy = policyWith({
      strategy,
      intensity: 2,
      childDeclarations: [declaredChild('c0', 'permanent', false), declaredChild('c1', 'permanent', false)],
    })
    const state = runningOf(
      coreWith(policy, [childOf('c0', gen, 'starting'), childOf('c1', gen, 'ready')], []),
    )
    const decision = decidedOf(stepOf(state, childTimerEvent('start_deadline', 'c0', gen, at)))

    return Match.value(coreOf(decision)).pipe(
      Match.tag('Some', ({ value }) =>
        isRestartFamily(decision) &&
        sameSeq(textOf(value.restartStamps), textOf([at])) &&
        Arr.contains(stopIdsOf(commandsOf(decision)), 'c0') &&
        sameSeq(
          Arr.map(
            Arr.filter(value.children, (child) => child.childId === 'c0'),
            labelOf,
          ),
          [`c0:${gen + 1}:starting`],
        )),
      Match.tag('None', () => false),
      Match.exhaustive,
    )
  },
)

it.prop(
  '∀g_UnbornIncarnation_=Stale',
  [
    RestartStrategy,
    Generation,
    EventTime,
    Schema.Literals(['ChildTerminated', 'ChildReady', 'ChildStopped', 'ProbeResult']),
  ],
  ([strategy, generation, at, tag]) => {
    const policy = policyWith({ strategy, childDeclarations: [declaredChild('c0', 'permanent', false)] })
    const state = runningOf(coreWith(policy, [childOf('c0', generation, 'ready')], []))
    const decision = decidedOf(stepOf(state, unbornEvent(tag, 'c0', generation + 1, at)))

    return isStaleDecision(decision) && hasNoCommands(decision) && evolvedOf(state, decision) === state
  },
)

it.prop(
  '∀t_UnsolicitedTimer_=Stale',
  [EventTime, Generation],
  ([at, generation]) => {
    const policy = policyWith({ strategy: 'one_for_one', childDeclarations: [declaredChild('c0', 'permanent', false)] })
    const state = runningOf(coreWith(policy, [childOf('c0', generation, 'ready')], []))
    const decision = decidedOf(stepOf(state, childTimerEvent('start_deadline', 'c0', generation, at)))

    return isStaleDecision(decision) && hasNoCommands(decision) && evolvedOf(state, decision) === state
  },
)

it.prop(
  '∀p_DynamicStopOutsideRunning_=Stale',
  [Schema.Literals(['Restarting', 'CoolingDown', 'ShuttingDown']), Generation, EventTime],
  ([phase, generation, at]) => {
    const policy = policyWith({ strategy: 'one_for_one', childDeclarations: [declaredChild('c0', 'permanent', false)] })
    const core = coreWith(policy, [childOf('c0', generation, 'ready')], [])
    const state: SupervisorState = Match.value(phase).pipe(
      Match.when('Restarting', () => new Restarting({ core, pending: [] })),
      Match.when('CoolingDown', () => new CoolingDown({ core, millis: PERIOD_MILLIS })),
      Match.when('ShuttingDown', () => new ShuttingDown({ core, reason: { _tag: 'Shutdown' } })),
      Match.exhaustive,
    )
    const decision = decidedOf(stepOf(state, dynamicStopEvent('r0', 'c0', generation, at)))

    return isStaleDecision(decision) && hasNoCommands(decision) && evolvedOf(state, decision) === state
  },
)

it.prop(
  '∀c_DynamicStarts_≤Ceiling',
  [CeilingWithinQuadraticFoldBudget, EventTime],
  ([ceiling, at0]) => {
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [],
      dynamic: {
        _tag: 'DynamicChildren',
        ceiling,
        restartType: 'transient',
        shutdown: { _tag: 'Brutal' },
        startTimeoutMillis: 50,
        probeFailureThreshold: 2,
      },
    })
    const requestAt = (index: number): SupervisionEvent => dynamicStartEvent(`r${index}`, at0 + index)
    const requests = Array.from({ length: ceiling + 2 }, (_, index) => requestAt(index))
    const outcome = folded(runningOf(coreWith(policy, [], [])), requests)

    const accepted = Arr.filter(outcome.decisions, isStartChildren)
    const refused = Arr.filter(outcome.decisions, isRefusal)
    const ids = Arr.flatMap(accepted, startIdsFromDecision)
    const expectedIds = Array.from({ length: ceiling }, (_, index) => `d${index}`)

    return Arr.length(accepted) === ceiling &&
      Arr.length(refused) === 2 &&
      sameSeq(ids, expectedIds)
  },
)

it.prop(
  '∀d_DynamicIds_⊥Reused',
  [EventTime, EventTime],
  ([at0, at1]) => {
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [],
      dynamic: {
        _tag: 'DynamicChildren',
        ceiling: 1,
        restartType: 'transient',
        shutdown: { _tag: 'Brutal' },
        startTimeoutMillis: 50,
        probeFailureThreshold: 2,
      },
    })
    const started = folded(runningOf(coreWith(policy, [], [])), [dynamicStartEvent('r0', at0)])
    const stopped = folded(started.state, [dynamicStopEvent('r1', 'd0', 0, at1)])
    const resumed = folded(stopped.state, [dynamicStartEvent('r2', at1 + 1)])

    const stopAcknowledged = Match.value(lastDecisionOf(stopped)).pipe(
      Match.tag(
        'Continue',
        (continued) => Arr.contains(stopIdsOf(continued.commands), 'd0') && repliesStopped(continued),
      ),
      Match.orElse(() => false),
    )
    const resumedIds = acceptedIdsOf(commandsOf(lastDecisionOf(resumed)))

    return stopAcknowledged && Arr.contains(resumedIds, 'd1') && Arr.contains(resumedIds, 'd0') === false
  },
)

it.prop(
  '∀k_BackoffDelay_=Schedule',
  [BackoffSchedule, EventTime, RestartCount],
  ([schedule, at, k]) => {
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [declaredChild('c0', 'permanent', false)],
      backoff: schedule,
    })
    const child: ChildInstance = { ...childOf('c0', 5, 'ready'), consecutiveRestarts: k }
    const state = runningOf(coreWith(policy, [child], []))
    const decision = decidedOf(stepOf(state, terminatedEvent('c0', 5, at, abnormalOf('boom'))))
    const delay = backoffDelayAt(schedule, k)

    return Match.value(delay).pipe(
      Match.when(0, () =>
        Match.value(decision).pipe(
          Match.tag('StartChildren', (started) =>
            sameSeq(startIdsOf(started.commands), ['c0']) &&
            Match.value(coreOf(started)).pipe(
              Match.tag('Some', ({ value }) => sameSeq(textOf(value.restartStamps), textOf([at]))),
              Match.tag('None', () => false),
              Match.exhaustive,
            )),
          Match.orElse(() => false),
        )),
      Match.orElse((deferred) =>
        Match.value(decision).pipe(
          Match.tag('RestartChildren', (restarted) =>
            deadlineIs(backoffDeadlineOf(restarted.commands, 'c0', 6), at + deferred) &&
            sameSeq(textOf(restarted.core.restartStamps), textOf([at]))),
          Match.orElse(() =>
            false
          ),
        )
      ),
    )
  },
)

it.prop(
  '∀k_ConsecutiveRestarts_=Growing',
  [PositiveMillis, Schema.Literals([1, 2, 3, 4]), PositiveMillis, EventTime, EventTime],
  ([base, multiplier, capMillis, at1, at2]) => {
    const schedule: BackoffSchedule = { baseMillis: base, multiplier, capMillis }
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [declaredChild('c0', 'permanent', false)],
      backoff: schedule,
    })
    const start = runningOf(coreWith(policy, [childOf('c0', 5, 'ready')], []))
    const first = folded(start, [terminatedEvent('c0', 5, at1, abnormalOf('boom'))])
    const firstDelay = backoffDelayAt(schedule, 0)
    const resumed = folded(first.state, [childTimerEvent('backoff', 'c0', 6, at1 + firstDelay)])
    const second = folded(resumed.state, [terminatedEvent('c0', 6, at2, abnormalOf('boom'))])
    const secondDelay = backoffDelayAt(schedule, 1)

    const secondArmed = Match.value(lastDecisionOf(second)).pipe(
      Match.tag(
        'RestartChildren',
        (restarted) =>
          deadlineIs(backoffDeadlineOf(restarted.commands, 'c0', 7), at2 + secondDelay) &&
          Match.value(Arr.head(restarted.core.restartStamps)).pipe(
            Match.tag('Some', (head) => head.value === at2),
            Match.tag('None', () => false),
            Match.exhaustive,
          ),
      ),
      Match.orElse(() => false),
    )

    return Match.value(lastDecisionOf(first)).pipe(
      Match.tag('RestartChildren', () => isStartChildren(lastDecisionOf(resumed))),
      Match.orElse(() => false),
    ) && secondArmed && secondDelay >= firstDelay
  },
)

it.prop(
  '∀k_BackoffDelay_=TotalNearMax',
  [BackoffSchedule, EventTime, PositiveMillis],
  ([schedule, at, tail]) => {
    const k = Number.MAX_SAFE_INTEGER - tail
    const policy = policyWith({
      strategy: 'one_for_one',
      childDeclarations: [declaredChild('c0', 'permanent', false)],
      backoff: schedule,
    })
    const child: ChildInstance = { ...childOf('c0', 5, 'ready'), consecutiveRestarts: k }
    const decision = decidedOf(
      stepOf(runningOf(coreWith(policy, [child], [])), terminatedEvent('c0', 5, at, abnormalOf('boom'))),
    )
    const delay = backoffDelayAt(schedule, k)

    const restarts = Match.value(delay).pipe(
      Match.when(0, () =>
        Match.value(decision).pipe(
          Match.tag('StartChildren', (started) => sameSeq(startIdsOf(started.commands), ['c0'])),
          Match.orElse(() => false),
        )),
      Match.orElse((deferred) =>
        Match.value(decision).pipe(
          Match.tag('RestartChildren', (restarted) =>
            deadlineIs(backoffDeadlineOf(restarted.commands, 'c0', 6), at + deferred)),
          Match.orElse(() =>
            false
          ),
        )
      ),
    )
    const countsOneMore = Match.value(coreOf(decision)).pipe(
      Match.tag(
        'Some',
        ({ value }) =>
          Arr.some(
            value.children,
            (restarted) => restarted.childId === 'c0' && restarted.consecutiveRestarts === k + 1,
          ),
      ),
      Match.tag('None', () => false),
      Match.exhaustive,
    )

    return restarts && countsOneMore && Number.isSafeInteger(k + 1)
  },
)

it.prop(
  '∀d_BucketSequence_=ExecutionOrder',
  [SupervisionPolicy, SupervisorCore, SupervisionEvent],
  ([policy, core, event]) => {
    const state = new Running({ core: { ...core, policy } })
    const decision = decidedOf(stepOf(state, event))

    return ranksAscend(commandsOf(decision))
  },
)

it.prop(
  '∀d_RestartBuckets_=StopsBeforeStarts',
  [SupervisionPolicy, SupervisorCore, SupervisionEvent],
  ([policy, core, event]) => {
    const state = new Running({ core: { ...core, policy } })
    const decision = decidedOf(stepOf(state, event))

    return noStopAfterStart(commandsOf(decision))
  },
)
