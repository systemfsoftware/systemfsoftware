import { expect, layer } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { Context } from 'effect'
import { Layer } from 'effect'

class Store extends Context.Service<Store, { readonly values: Array<number> }>()(
  'vitest-conformance/probes/runner/isolation/Store',
) {
  static layer = Layer.sync(Store, () => ({ values: [] }))
}

layer(Store.layer)('layer store isolation', (it) => {
  it.effect('Should_SeeAnEmptyStore_When_RunningTestAlreadyWrote', () =>
    Effect.gen(function*() {
      const store = yield* Store
      expect(store.values).toEqual([])
      store.values.push(1)
      expect(store.values).toEqual([1])
    }))

  it.effect('Should_SeeAnEmptyStore_When_AnotherTestWroteFirst', () =>
    Effect.gen(function*() {
      const store = yield* Store
      expect(store.values).toEqual([])
    }))
})
