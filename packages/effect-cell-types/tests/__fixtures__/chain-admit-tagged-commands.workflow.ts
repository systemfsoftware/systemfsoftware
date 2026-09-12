import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { Result } from 'effect/Result'
import * as S from 'effect/Schema'

import { acceptTaggedCommand, DecisionOne, DecisionTwo } from './accept-tagged-command.workflow.js'
import { TaggedCmd } from './Command.schema.js'
import { type Decision as TotalDecision, DecisionError } from './Decision.schema.js'

export class ChainedTaggedCommand extends S.TaggedClass<ChainedTaggedCommand>()('ChainedTaggedCommand', {
  decision: S.Union([DecisionOne, DecisionTwo]),
  ctx: S.String,
}) {}

declare const decideChainedCommand:
  & ((command: ChainedTaggedCommand) => Result<TotalDecision, DecisionError>)
  & Workflow.WorkflowBrand

export const chainAdmitTaggedCommands = Workflow.andThen(
  TaggedCmd,
  acceptTaggedCommand,
  ChainedTaggedCommand,
  'tagged-chain',
  decideChainedCommand,
)
