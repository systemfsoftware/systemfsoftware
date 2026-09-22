/// <reference types="vitest/importMeta" />
import { Context, Effect, Schema } from 'effect'

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

const isTaskContext = (ctx: unknown): ctx is VitestTaskContext => typeof ctx === 'object' && ctx !== null

const readTaskContext = <Ctx>(ctx: Ctx): VitestTaskContext | null => {
  if (isTaskContext(ctx)) return ctx
  return null
}

export const provideTaskRef = <A, E, R, Ctx>(effect: Effect.Effect<A, E, R>, ctx: Ctx): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.provideService(VitestTaskRef, readTaskContext(ctx)))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const Labelled = Schema.Struct({ tag: Schema.String })

  it.prop(
    '∀o_ReadTaskContext_=Identity',
    [Labelled],
    ([record]) => Effect.sync(() => readTaskContext(record) === record),
  )

  it.prop(
    '∀p_ReadTaskContext_=Null',
    [Schema.String],
    ([primitive]) => Effect.sync(() => readTaskContext(primitive) === null),
  )
}
