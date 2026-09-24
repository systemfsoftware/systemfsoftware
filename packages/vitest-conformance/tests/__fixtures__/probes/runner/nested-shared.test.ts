import { layer } from '@effect/vitest'
import { Context } from 'effect'
import { Effect } from 'effect'
import { Layer } from 'effect'

class BuildCount extends Context.Service<BuildCount, { readonly count: number }>()(
  'vitest-conformance/probes/runner/nested-shared/BuildCount',
) {}

let outerBuilds = 0

const countingOuter = Layer.effect(
  BuildCount,
  Effect.sync(() => {
    outerBuilds = outerBuilds + 1
    return { count: outerBuilds }
  }),
)

class Inner extends Context.Service<Inner, { readonly tag: string }>()(
  'vitest-conformance/probes/runner/nested-shared/Inner',
) {
  static layer = Layer.succeed(Inner, { tag: 'inner' })
}

layer(countingOuter, { shared: true })('nested inside shared', (it) => {
  it.layer(Inner.layer)('nested block', (nested) => {
    nested('Should_SeeOuterState_When_NestedInsideShared', function*({ expect }) {
      const outer = yield* BuildCount
      const inner = yield* Inner
      yield* expect({ inner: inner.tag, outer: outer.count }).toEqual({ inner: 'inner', outer: 1 })
    })

    nested('Should_KeepOuterBuild_When_ANestedTestAlreadyRan', function*({ expect }) {
      const outer = yield* BuildCount
      yield* expect(outer.count).toEqual(1)
    })
  })
})
