import { it } from '@effect/vitest'
import { Match, Result } from 'effect'
import { evolveSupervisor, SupervisionEvolution } from '../kernel/evolve-supervisor.workflow.js'
import {
  Continue,
  interpretSupervisionEvent,
  type SupervisionDecision,
  SupervisionStep,
  SupervisorState,
} from '../kernel/interpret-supervision-event.workflow.js'
import { SupervisorCore } from '../kernel/SupervisorState.schema.js'

type Evolve = typeof evolveSupervisor

const decidedOf = (step: SupervisionStep): SupervisionDecision => Result.getOrThrow(interpretSupervisionEvent(step))

const evolvedOf = (evolve: Evolve, state: SupervisorState, decision: SupervisionDecision): SupervisorState =>
  Result.getOrThrow(evolve(new SupervisionEvolution({ state, decision })))

const phaseOf = (state: SupervisorState): string =>
  Match.value(state).pipe(
    Match.tag('Running', () => 'Running'),
    Match.tag('Restarting', () => 'Restarting'),
    Match.tag('CoolingDown', () => 'CoolingDown'),
    Match.tag('ShuttingDown', () => 'ShuttingDown'),
    Match.tag('Terminated', () => 'Terminated'),
    Match.exhaustive,
  )

const expectedPhaseOf = (decision: SupervisionDecision): string =>
  Match.value(decision).pipe(
    Match.tag('RestartChildren', () => 'Restarting'),
    Match.tag('StartChildren', () => 'Running'),
    Match.tag('CoolDown', () => 'CoolingDown'),
    Match.tag('StopChildren', () => 'ShuttingDown'),
    Match.tag('Terminate', () => 'Terminated'),
    Match.tag('Stale', () => 'preserved'),
    Match.tag('Continue', () => 'preserved'),
    Match.tag('RefuseDynamicStart', () => 'preserved'),
    Match.exhaustive,
  )

it.prop(
  '∀e_Evolve_=DecisionPhase',
  { of: [SupervisionEvolution], subject: evolveSupervisor },
  (subject, [step]) => {
    const evolved = evolvedOf(subject, step.state, step.decision)

    return Match.value(step.decision).pipe(
      Match.tag('Stale', () => evolved === step.state),
      Match.tag('RefuseDynamicStart', () => evolved === step.state),
      Match.tag('Continue', () => phaseOf(evolved) === phaseOf(step.state)),
      Match.orElse(() => phaseOf(evolved) === expectedPhaseOf(step.decision)),
    )
  },
)

it.prop(
  '∀s_FoldStep_=ConsistentPhase',
  { of: [SupervisionStep], subject: evolveSupervisor },
  (subject, [step]) => {
    const decision = decidedOf(step)
    const evolved = evolvedOf(subject, step.state, decision)

    return Match.value(decision).pipe(
      Match.tag('Stale', () => evolved === step.state),
      Match.tag('RefuseDynamicStart', () => evolved === step.state),
      Match.tag('Continue', () => phaseOf(evolved) === phaseOf(step.state)),
      Match.orElse(() => phaseOf(evolved) === expectedPhaseOf(decision)),
    )
  },
)

it.prop(
  '∀d_Continue_=SamePhase',
  { of: [SupervisorState, SupervisorCore], subject: evolveSupervisor },
  (subject, [state, core]) => {
    const evolved = evolvedOf(
      subject,
      state,
      new Continue({ core, commands: { stops: [], starts: [], arms: [], replies: [], terminates: [] } }),
    )

    return phaseOf(evolved) === phaseOf(state)
  },
)
