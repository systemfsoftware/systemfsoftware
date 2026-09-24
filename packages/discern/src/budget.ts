import { Predicate } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as MutableRef from 'effect/MutableRef'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type { BudgetLimits, BudgetSpend } from './Budget.schema.js'

export const TypeId = Symbol.for('@systemfsoftware/discern/Budget')
export type TypeId = typeof TypeId

export interface Budget extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly limits: BudgetLimits
  readonly counters: MutableRef.MutableRef<BudgetSpend>
}

export const isBudget = (u: unknown): u is Budget => Predicate.hasProperty(u, TypeId)

const noSpend: BudgetSpend = { decisions: 0, calls: 0 }

export const budget = (limits: BudgetLimits): Budget => ({
  [TypeId]: TypeId,
  limits,
  counters: MutableRef.make(noSpend),
  ...Prototype,
})

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
