import { it } from '@systemfsoftware/vitest'
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
  (subject, [step]) =>
    Result.match(subject(new SupervisionEvolution({ state: step.state, decision: step.decision })), {
      onFailure: () => false,
      onSuccess: (evolved) =>
        Match.value(step.decision).pipe(
          Match.tag('Stale', () => evolved === step.state),
          Match.tag('RefuseDynamicStart', () => evolved === step.state),
          Match.tag('Continue', () => phaseOf(evolved) === phaseOf(step.state)),
          Match.orElse(() => phaseOf(evolved) === expectedPhaseOf(step.decision)),
        ),
    }),
)

it.prop(
  '∀s_FoldStep_=ConsistentPhase',
  { of: [SupervisionStep], subject: evolveSupervisor },
  (subject, [step]) =>
    Result.match(interpretSupervisionEvent(step), {
      onFailure: () => false,
      onSuccess: (decision) =>
        Result.match(subject(new SupervisionEvolution({ state: step.state, decision })), {
          onFailure: () => false,
          onSuccess: (evolved) =>
            Match.value(decision).pipe(
              Match.tag('Stale', () => evolved === step.state),
              Match.tag('RefuseDynamicStart', () => evolved === step.state),
              Match.tag('Continue', () => phaseOf(evolved) === phaseOf(step.state)),
              Match.orElse(() => phaseOf(evolved) === expectedPhaseOf(decision)),
            ),
        }),
    }),
)

it.prop(
  '∀d_Continue_=SamePhase',
  { of: [SupervisorState, SupervisorCore], subject: evolveSupervisor },
  (subject, [state, core]) =>
    Result.match(
      subject(
        new SupervisionEvolution({
          state,
          decision: new Continue({ core, commands: { stops: [], starts: [], arms: [], replies: [], terminates: [] } }),
        }),
      ),
      {
        onFailure: () => false,
        onSuccess: (evolved) => phaseOf(evolved) === phaseOf(state),
      },
    ),
)
