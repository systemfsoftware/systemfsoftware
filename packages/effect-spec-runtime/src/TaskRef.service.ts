/// <reference types="vitest/importMeta" />
import { vitestTestContextKey } from '@systemfsoftware/vitest'
import { Context, Effect, Option, Schema } from 'effect'
import { dual } from 'effect/Function'

export interface VitestTaskContext<Ann = unknown> {
  readonly annotate?: ((message: string, type?: string) => Promise<void> | void) | undefined
  readonly task?: {
    readonly annotations?: readonly Ann[] | undefined
  } | undefined
}

export const VitestTaskRef: Context.Reference<VitestTaskContext | null> = Context.Reference<VitestTaskContext | null>(
  '@systemfsoftware/effect-spec-runtime/VitestTask',
  {
    defaultValue: () => null,
  },
)

/**
 * The task context as the fork's run provides it: built on the fork's own key, so a case lane that goes
 * through `provideTaskRef` and a property lane the fork runs itself read the same context.
 */
export const RawVitestTaskRef: Context.Reference<VitestTaskContext | null> = Context.Reference<
  VitestTaskContext | null
>(vitestTestContextKey, {
  defaultValue: () => null,
})

const isPlainTaskContext = <Ctx>(ctx: Ctx): ctx is Ctx & VitestTaskContext => typeof ctx === 'object' && ctx !== null

const isTaskContext = <Ctx>(ctx: Ctx): ctx is Ctx & VitestTaskContext =>
  typeof ctx === 'object' ? ctx !== null : typeof ctx === 'function'

const readTaskContext = <Ctx>(ctx: Ctx): VitestTaskContext | null =>
  Option.getOrNull(Option.liftPredicate(ctx, isPlainTaskContext))

const readRawTaskContext = <Ctx>(ctx: Ctx): VitestTaskContext | null =>
  Option.getOrNull(Option.liftPredicate(ctx, isTaskContext))

const provideTaskRefImpl = <A, E, R, Ctx>(effect: Effect.Effect<A, E, R>, ctx: Ctx): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.provideService(VitestTaskRef, readTaskContext(ctx)),
    Effect.provideService(RawVitestTaskRef, readRawTaskContext(ctx)),
  )

export const provideTaskRef: {
  <Ctx>(ctx: Ctx): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R, Ctx>(effect: Effect.Effect<A, E, R>, ctx: Ctx): Effect.Effect<A, E, R>
} = dual(2, provideTaskRefImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const Labelled = Schema.Struct({ tag: Schema.String })

  const sameReference = (left: object | null, right: object | null): boolean => left === right

  const isMissing = (value: object | null): boolean => value === null

  it.prop(
    '∀o_ReadTaskContext_=Identity',
    { of: [Labelled], subject: readTaskContext },
    (read, [record]) => sameReference(read(record), record),
  )

  it.prop(
    '∀p_ReadTaskContext_=Null',
    { of: [Schema.String], subject: readTaskContext },
    (read, [primitive]) => isMissing(read(primitive)),
  )
}
