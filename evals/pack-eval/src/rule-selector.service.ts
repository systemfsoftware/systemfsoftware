import { Context, type Effect } from 'effect'
import type { Pack } from './pack-rule.schema.js'
import type { SelectionError, SelectionTrace } from './selection-trace.schema.js'
import type { SelectorInstruction } from './selector-instruction.schema.js'
import type { Task } from './task-set.schema.js'

export interface RuleSelectionRequest {
  readonly pack: Pack
  readonly task: Task
  readonly instruction: SelectorInstruction
}

export interface RuleSelectorShape {
  readonly select: (request: RuleSelectionRequest) => Effect.Effect<SelectionTrace, SelectionError>
}

export class RuleSelector extends Context.Service<RuleSelector, RuleSelectorShape>()(
  '@systemfsoftware/pack-eval/RuleSelector',
) {}
