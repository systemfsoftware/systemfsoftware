import { Workflow } from '@systemfsoftware/effect-cell-types'

import { admitDecodedCommand, Decoded } from './admit-decoded-command.workflow.js'
import { SettleCommand, totalAdmitDecision } from './total-admit-decision.workflow.js'

/**
 * The composite that puts both decisions in one cell: what the first decides becomes the
 * command the second decides on, so a refusal in the first short-circuits — the second
 * never runs.
 *
 * `andThen` takes constructed workflows where a decider would sit, so this file holds no
 * decision body of its own: both bodies live in the file that owns each of them.
 */
export const chainAdmitDecisions = (trace: string[]) =>
  Workflow.andThen(Decoded, admitDecodedCommand, SettleCommand, totalAdmitDecision(trace))
