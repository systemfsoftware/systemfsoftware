import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'

export interface RawDriver {
  readonly exec: (cmd: string) => Promise<number>
}

export const TypeId = Symbol.for('~systemfsoftware/effect-cell-types/tests/RunningContainer')
export type TypeId = typeof TypeId

const RunningContainer = Handle.make<{ readonly id: string }, RawDriver>()(TypeId)

export type RunningContainer = Handle.Of<typeof RunningContainer>

export const isRunningContainer = RunningContainer.is

export const make = (options: { readonly id: string; readonly driver: RawDriver }): RunningContainer =>
  RunningContainer.make({ id: options.id }, options.driver)

export const exec: {
  (cmd: string): (self: RunningContainer) => Effect.Effect<number>
  (self: RunningContainer, cmd: string): Effect.Effect<number>
} = dual(
  2,
  (self: RunningContainer, cmd: string): Effect.Effect<number> =>
    Effect.promise(() => RunningContainer.slot(self).exec(cmd)),
)
