/// <reference types="vitest/importMeta" />
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

export const RawVitestTaskRef: Context.Reference<VitestTaskContext | null> = Context.Reference<
  VitestTaskContext | null
>('@systemfsoftware/effect-spec-runtime/VitestTaskRaw', {
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
  const { it } = await import('@effect/vitest')

  const Labelled = Schema.Struct({ tag: Schema.String })

  it.prop(
    '∀o_ReadTaskContext_=Identity',
    [Labelled],
    ([record]) => readTaskContext(record) === record,
  )

  it.prop(
    '∀p_ReadTaskContext_=Null',
    [Schema.String],
    ([primitive]) => readTaskContext(primitive) === null,
  )
}
