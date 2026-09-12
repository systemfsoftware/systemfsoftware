import { Workflow } from '@systemfsoftware/effect-cell-types'

import { SettleCommand, totalAdmitDecision } from './total-admit-decision.workflow.js'

/**
 * The composite of two total workflows: neither component can fail, so the component error
 * union is `never` and `andThen` publishes the branded total form instead of a `Workflow`
 * alias whose `never` channel refuses the composite.
 *
 * `andThen` takes constructed workflows where a decider would sit, so this file holds no
 * decision body of its own: the one body lives in the file that owns it, and both slots take
 * it — the second rules on the decision the first published.
 */
export const totalPairAdmitTaggedCommands = (trace: string[]) =>
  Workflow.andThen(
    SettleCommand,
    totalAdmitDecision(trace),
    SettleCommand,
    'second',
    totalAdmitDecision(trace),
  )
