import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Result } from 'effect'
import { initialStateOf } from '../kernel/initial-supervisor-state.js'
import {
  interpretSupervisionEvent,
  Running,
  type SupervisionDecision,
  SupervisionStep,
} from '../kernel/interpret-supervision-event.workflow.js'
import { EventTime } from '../kernel/SupervisionLimits.schema.js'
import type { StartChild, SupervisorCommands } from '../kernel/SupervisorCommand.schema.js'
import { SupervisionPolicy } from '../kernel/SupervisorPolicy.schema.js'
import type { ChildDeclaration, RestartStrategy, RestartType, ShutdownMode } from '../kernel/SupervisorPolicy.schema.js'
import { DrawnChildren } from './supervisor-boot.schema.js'

type Decide = typeof interpretSupervisionEvent

interface DrawnChild {
  readonly name: string
  readonly restart: RestartType
}

const drawnChildrenOf = (drawn: DrawnChildren): ReadonlyArray<DrawnChild> =>
  Arr.map(drawn, (child) => ({ name: child['name'], restart: child['restart'] }))

const noCommands: SupervisorCommands = { stops: [], starts: [], arms: [], replies: [], terminates: [] }

const shutdownBrutal: ShutdownMode = { _tag: 'Brutal' }

const policyOf = (
  strategy: RestartStrategy,
  declarations: ReadonlyArray<ChildDeclaration>,
): SupervisionPolicy =>
  new SupervisionPolicy({
    strategy,
    intensity: 8,
    periodMillis: 100,
    autoShutdown: 'never',
    coolDown: { _tag: 'NoCoolDown' },
    backoff: { baseMillis: 0, multiplier: 2, capMillis: 0 },
    dynamic: { _tag: 'NoDynamicChildren' },
    livenessTickMillis: 10,
    childDeclarations: declarations,
  })

const declarationsOf = (drawn: DrawnChildren): ReadonlyArray<ChildDeclaration> =>
  Arr.map(drawnChildrenOf(drawn), (child): ChildDeclaration => ({
    childId: child.name,
    restartType: child.restart,
    shutdown: shutdownBrutal,
    significant: false,
    startTimeoutMillis: 50,
    probeFailureThreshold: 2,
  }))

const bootsTo = (
  decide: Decide,
  policy: SupervisionPolicy,
  at: EventTime,
): SupervisionDecision =>
  Result.getOrThrow(
    decide(
      new SupervisionStep({
        state: new Running({ core: initialStateOf(policy) }),
        event: { _tag: 'SupervisorStarted', at },
      }),
    ),
  )

const bootCommandsOf = (
  decide: Decide,
  policy: SupervisionPolicy,
  at: EventTime,
): SupervisorCommands =>
  Match.value(bootsTo(decide, policy, at)).pipe(
    Match.tag('StartChildren', (started) => started.commands),
    Match.orElse(() => noCommands),
  )

const startIdOf = (start: StartChild): string => start.childId

it.prop(
  '∀b_BootStart_=DeclaredOrder',
  { of: [DrawnChildren, EventTime], subject: interpretSupervisionEvent },
  (subject, [drawn, at]) => {
    const ids = Arr.map(drawnChildrenOf(drawn), (child) => child.name)
    const commands = bootCommandsOf(subject, policyOf('one_for_one', declarationsOf(drawn)), at)
    return commands.stops.length === 0 &&
      commands.replies.length === 0 &&
      commands.terminates.length === 0 &&
      Arr.join(Arr.map(commands.starts, startIdOf), '|') === Arr.join(ids, '|')
  },
)

it.prop(
  '∀b_BootArm_=StartDeadline',
  { of: [DrawnChildren, EventTime], subject: interpretSupervisionEvent },
  (subject, [drawn, at]) => {
    const ids = Arr.map(drawnChildrenOf(drawn), (child) => child.name)
    if (Arr.dedupe(ids).length !== ids.length) return true
    const commands = bootCommandsOf(subject, policyOf('rest_for_one', declarationsOf(drawn)), at)
    const deadlineHolds = (arm: (typeof commands.arms)[number]): boolean =>
      Match.value(arm).pipe(
        Match.tag('ArmChildTimer', (timer) => timer.kind === 'start_deadline' && timer.deadline === at + 50),
        Match.tag('ArmSupervisorTimer', () => false),
        Match.exhaustive,
      )
    return commands.arms.length === ids.length && Arr.every(commands.arms, deadlineHolds)
  },
)

it.prop(
  '∀b_BootSeed_=Starting',
  { of: [DrawnChildren], subject: initialStateOf },
  (subject, [drawn]) => {
    const ids = Arr.map(drawnChildrenOf(drawn), (child) => child.name)
    if (Arr.dedupe(ids).length !== ids.length) return true
    const core = subject(policyOf('one_for_all', declarationsOf(drawn)))
    return Arr.join(Arr.map(core.children, (child) => child.childId), '|') === Arr.join(ids, '|') &&
      Arr.every(core.children, (child) => child.status === 'starting' && child.generation === 0) &&
      core.restartStamps.length === 0 &&
      core.nextOrdinal === 0
  },
)
