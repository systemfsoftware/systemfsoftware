import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as MutableRef from 'effect/MutableRef'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type { BudgetLimits, BudgetSpend } from './Budget.schema.js'

export const TypeId = Symbol.for('@systemfsoftware/discern/Budget')
export type TypeId = typeof TypeId

const ChargeId: unique symbol = Symbol.for('@systemfsoftware/discern/Budget/charge')

export interface Budget extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [ChargeId]: (decisions: number) => void
  readonly limits: BudgetLimits
  readonly spent: () => BudgetSpend
  readonly reset: () => void
}

const noSpend: BudgetSpend = { decisions: 0, calls: 0 }

export const budget = (limits: BudgetLimits): Budget => {
  const counters = MutableRef.make(noSpend)
  return {
    [TypeId]: TypeId,
    [ChargeId]: (decisions) => {
      MutableRef.set(counters, {
        decisions: counters.current.decisions + decisions,
        calls: counters.current.calls + 1,
      })
    },
    limits,
    spent: () => MutableRef.get(counters),
    reset: () => {
      MutableRef.set(counters, noSpend)
    },
    ...Prototype,
  }
}

export const chargeBudget: {
  (decisions: number): (self: Budget) => Effect.Effect<void>
  (self: Budget, decisions: number): Effect.Effect<void>
} = dual(2, (self: Budget, decisions: number): Effect.Effect<void> => Effect.sync(() => self[ChargeId](decisions)))
