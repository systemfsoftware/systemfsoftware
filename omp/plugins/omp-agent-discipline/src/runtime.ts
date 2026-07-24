import { NodeFileSystem } from '@effect/platform-node'
import * as PathModule from '@effect/platform/Path'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Context, Effect, Layer, ManagedRuntime, MutableHashMap, Ref } from 'effect'

export class GuardCache extends Context.Tag('GuardCache')<
  GuardCache,
  { readonly cache: Ref.Ref<MutableHashMap.MutableHashMap<string, unknown>> }
>() {}

export const GuardCacheLive: Layer.Layer<GuardCache> = Layer.effect(
  GuardCache,
  Effect.gen(function*() {
    const cache = yield* Ref.make(MutableHashMap.empty<string, unknown>())
    return { cache }
  }),
)

export const nodeLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  PathModule.layer,
  GuardCacheLive,
  TomlLoaderLive.pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(PathModule.layer),
  ),
)

export const runtime = ManagedRuntime.make(nodeLayer)
