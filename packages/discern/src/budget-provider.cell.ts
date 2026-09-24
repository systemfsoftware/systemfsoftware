import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { AdmitBudgetCharge, admitBudgetCharge } from './admit-budget-charge.workflow.js'
import { type Budget, chargeBudget, spent } from './budget.js'
import type { Provider } from './decision-model.js'

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

const readBudget = (request: BudgetRequest): Effect.Effect<BudgetRead> =>
  Effect.map(spent(request.budget), (spend): BudgetRead => ({
    _tag: 'AdmitBudgetCharge',
    spentDecisions: spend.decisions,
    spentCalls: spend.calls,
    requestedDecisions: Object.keys(request.options.decisions).length,
    maxDecisions: request.budget.limits.decisions,
    maxCalls: request.budget.limits.calls,
    options: request.options,
    inner: request.inner,
    budget: request.budget,
  }))

export const chargeBudgetCall = Sandwich.named('discern.model.budget')(readBudget)
  .decide(admitBudgetCharge)
  .write({
    ChargeAdmitted: (admitted, read) =>
      Effect.flatMap(chargeBudget(read.budget, admitted.decisions), () => read.inner.decide(read.options)),
    BudgetExhausted: (refusal, _read) => Effect.fail(refusal),
    CommandRejected: (rejected, read) =>
      Effect.fail(
        AiError.make({
          module: 'Discern',
          method: 'budgeted',
          reason: new AiError.InvalidRequestError({
            description: `Discern refused a budget charge of ${read.requestedDecisions} decisions ` +
              `(spent ${read.spentDecisions} decisions in ${read.spentCalls} calls): ${rejected.issue}`,
          }),
        }),
      ),
  })
