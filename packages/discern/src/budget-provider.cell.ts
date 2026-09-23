import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { AdmitBudgetCharge, admitBudgetCharge } from './admit-budget-charge.workflow.js'
import { type Budget, chargeBudget } from './budget.handle.js'
import type { Provider } from './decision-model.resource.js'

export interface BudgetRequest {
  readonly options: DecisionModel.ProviderOptions
  readonly inner: Provider
  readonly budget: Budget
}

export type BudgetRead = (typeof AdmitBudgetCharge)['Encoded'] & {
  readonly options: DecisionModel.ProviderOptions
  readonly inner: Provider
  readonly budget: Budget
}

const readBudget = (request: BudgetRequest): Effect.Effect<BudgetRead> => {
  const spent = request.budget.spent()
  return Effect.succeed({
    _tag: 'AdmitBudgetCharge',
    spentDecisions: spent.decisions,
    spentCalls: spent.calls,
    requestedDecisions: Object.keys(request.options.decisions).length,
    maxDecisions: request.budget.limits.decisions,
    maxCalls: request.budget.limits.calls,
    options: request.options,
    inner: request.inner,
    budget: request.budget,
  })
}

export const chargeBudgetCall = Sandwich.named('discern.model.budget')(readBudget)
  .decide(admitBudgetCharge)
  .write({
    ChargeAdmitted: (admitted, read) =>
      Effect.flatMap(chargeBudget(read.budget, admitted.decisions), () => read.inner.decide(read.options)),
    BudgetExhausted: (refusal, _read) => Effect.fail(refusal),
    CommandRejected: (rejected, _read) => Effect.fail(new AiError.InvalidRequestError({ description: rejected.issue })),
  })
