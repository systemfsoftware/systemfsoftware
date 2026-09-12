import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Admitted, Rejected } from './admit-decoded-command.workflow.js'

/**
 * The command the composite settles on: the upstream decision rides as a field, which is
 * the shape `Workflow.andThen` looks for when it builds the downstream command. It is
 * declared here because `schema-declaration-location` sanctions a module-scope schema only
 * in a `*.schema.ts` or in the `<stem>.workflow.ts` that owns it.
 */
export class SettleCommand extends S.TaggedClass<SettleCommand>()('SettleCommand', {
  decision: S.Union([Admitted, Rejected]),
  ctx: S.String,
}) {}

/**
 * The decision that cannot fail: the settled command already carries the upstream
 * decision, so this decider publishes it as its own.
 *
 * The body hands `command.decision` back instead of rebuilding each variant because a make
 * body may reference only its own parameters, this module's declarations and the sealed
 * `effect` surface — the decision classes, owned by `admit-decoded-command`, are out of its
 * reach. The value published is the same either way.
 */
export const totalAdmitDecision = (trace: string[]) =>
  Workflow.total(SettleCommand, (command: SettleCommand): Result.Result<Admitted | Rejected, never> => {
    trace.push(`settle:${command.ctx}`)
    return Result.succeed(command.decision)
  })
