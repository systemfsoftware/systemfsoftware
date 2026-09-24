import { expect, layer } from '@systemfsoftware/vitest'
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
    nested.effect('Should_SeeOuterState_When_NestedInsideShared', () =>
      Effect.gen(function*() {
        const outer = yield* BuildCount
        const inner = yield* Inner
        expect(inner.tag).toEqual('inner')
        expect(outer.count).toEqual(1)
      }))

    nested.effect('Should_KeepOuterBuild_When_ANestedTestAlreadyRan', () =>
      Effect.gen(function*() {
        const outer = yield* BuildCount
        expect(outer.count).toEqual(1)
      }))
  })
})
