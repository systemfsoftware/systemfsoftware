import { layer } from '@effect/vitest'
import { Context } from 'effect'
import { Layer } from 'effect'

class Store extends Context.Service<Store, { readonly values: Array<number> }>()(
  'vitest-conformance/probes/runner/isolation/Store',
) {
  static layer = Layer.sync(Store, () => ({ values: [] }))
}

layer(Store.layer)('layer store isolation', (it) => {
  it('Should_SeeAnEmptyStore_When_RunningTestAlreadyWrote', function*({ expect }) {
    const store = yield* Store
    const before = [...store.values]
    store.values.push(1)
    yield* expect({ before, after: store.values }).toEqual({ before: [], after: [1] })
  })

  it('Should_SeeAnEmptyStore_When_AnotherTestWroteFirst', function*({ expect }) {
    const store = yield* Store
    yield* expect(store.values).toEqual([])
  })
})
