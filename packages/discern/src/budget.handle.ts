import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as MutableRef from 'effect/MutableRef'
import type { BudgetLimits, BudgetSpend } from './Budget.schema.js'

export const TypeId = Symbol.for('@systemfsoftware/discern/Budget')
export type TypeId = typeof TypeId

const Budget = Handle.make<{ readonly limits: BudgetLimits; readonly counters: MutableRef.MutableRef<BudgetSpend> }>()(
  TypeId,
)

export type Budget = Handle.Of<typeof Budget>

export const isBudget = Budget.is

const noSpend: BudgetSpend = { decisions: 0, calls: 0 }

export const budget = (limits: BudgetLimits): Budget => Budget.make({ limits, counters: MutableRef.make(noSpend) })

export const spent = (self: Budget): Effect.Effect<BudgetSpend> => Effect.sync(() => MutableRef.get(self.counters))

export const chargeBudget: {
  (decisions: number): (self: Budget) => Effect.Effect<void>
  (self: Budget, decisions: number): Effect.Effect<void>
} = dual(
  2,
  (self: Budget, decisions: number): Effect.Effect<void> =>
    Effect.sync(() =>
      MutableRef.update(self.counters, (spend): BudgetSpend => ({
        decisions: spend.decisions + decisions,
        calls: spend.calls + 1,
      }))
    ),
)

export const reset = (self: Budget): Effect.Effect<void> => Effect.sync(() => MutableRef.set(self.counters, noSpend))
