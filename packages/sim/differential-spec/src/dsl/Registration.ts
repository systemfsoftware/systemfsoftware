import { Effect, Option } from 'effect'
import type * as V from 'vitest'
import type { DualExecutionSupervisorOptions, HostBound } from '../core/DualExecutionSupervisor.js'

const UNTIMED: V.TestOptions = { timeout: 0 }

const boundOf = (options?: DualExecutionSupervisorOptions): HostBound | undefined => options?.hostBound

const silent: (ctx: V.TestContext | null) => Effect.Effect<void> = () => Effect.void

const announcerFor = (bound: HostBound): (ctx: V.TestContext | null) => Effect.Effect<void> => (ctx) =>
  ctx === null
    ? Effect.void
    : Effect.asVoid(Effect.promise(() => ctx.annotate(`host-bound check: ${bound.reason}`)))

export const checkOptions = (options?: DualExecutionSupervisorOptions): V.TestOptions =>
  Option.match(Option.fromNullishOr(boundOf(options)), {
    onNone: () => UNTIMED,
    onSome: (bound) => ({ timeout: bound.timeout }),
  })

export const announceHostBound = (
  options?: DualExecutionSupervisorOptions,
): (ctx: V.TestContext | null) => Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(boundOf(options)), { onNone: () => silent, onSome: announcerFor })
