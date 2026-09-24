import type { TestContext, TestOptions } from '@effect/vitest'
import { Effect, Option } from 'effect'
import type { DualExecutionSupervisorOptions, HostBound } from '../core/DualExecutionSupervisor.js'

const UNTIMED: TestOptions = { timeout: 0 }

const boundOf = (options?: DualExecutionSupervisorOptions): HostBound | undefined => options?.hostBound

const silent = (_ctx: TestContext): Effect.Effect<void> => Effect.void

const announcerFor = (bound: HostBound): (ctx: TestContext) => Effect.Effect<void> => (ctx) =>
  Effect.asVoid(Effect.promise(() => ctx.annotate(`host-bound check: ${bound.reason}`)))

export const checkOptions = (options?: DualExecutionSupervisorOptions): TestOptions =>
  Option.match(Option.fromNullishOr(boundOf(options)), {
    onNone: () => UNTIMED,
    onSome: (bound) => ({ timeout: bound.timeout }),
  })

export const announceHostBound = (
  options?: DualExecutionSupervisorOptions,
): (ctx: TestContext) => Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(boundOf(options)), { onNone: () => silent, onSome: announcerFor })
