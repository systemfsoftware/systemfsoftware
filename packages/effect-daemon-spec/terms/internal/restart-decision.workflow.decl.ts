/**
 * `src/internal/restart-decision.workflow.ts`, as a declaration.
 *
 * The supervision decision: continue, restart a set of children, or give up. Two arms name the cases
 * that decide themselves from the command's own flags, and the fallback carries the one case that needs
 * arithmetic — which the kernel beside it owns, because `restartIndicesFor` is a total function over a
 * strategy and two indices and belongs where a property test can reach it.
 *
 * The dispatch needs no `bind`: the subject is `command` itself, so the arms already have the only
 * value they read.
 */
import { at, callOf, int, nonEmptyArrayOf, workflow } from '../../../../scripts/tools/workflow.ts'

export default workflow({
  operation: 'decideRestart',
  typeId: { namespace: '@systemfsoftware/effect-daemon', name: 'RestartDecision' },
  command: { type: 'DecideInput', from: './restart-decision.schema.js' },
  decision: {
    variants: [
      { class: 'RestartDecisionContinue', tag: 'Continue', fields: {} },
      { class: 'RestartDecisionRestart', tag: 'Restart', fields: { indices: nonEmptyArrayOf(int) } },
    ],
  },
  error: { variants: [{ class: 'RestartDecisionExhausted', tag: 'Exhausted', fields: {} }] },
  dispatch: {
    on: 'command',
    arms: [
      { pattern: { exitSuccess: true }, channel: 'right', construct: 'RestartDecisionContinue', with: {} },
      {
        pattern: { exitSuccess: false, intensityExceeded: true },
        channel: 'left',
        construct: 'RestartDecisionExhausted',
        with: {},
      },
    ],
    fallback: {
      channel: 'right',
      construct: 'RestartDecisionRestart',
      with: {
        indices: callOf(
          'restartIndicesFor',
          './restart-decision.kernel.js',
          at('strategy'),
          at('failedIndex'),
          at('totalChildren'),
        ),
      },
    },
  },
})
