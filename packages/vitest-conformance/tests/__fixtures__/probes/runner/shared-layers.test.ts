import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { Context } from 'effect'
import { Layer } from 'effect'

class Store extends Context.Service<Store, { readonly values: Array<number> }>()(
  'vitest-conformance/probes/runner/shared-layers/Store',
) {
  static layer = Layer.succeed(Store, { values: [] })
}

layer(Store.layer, { shared: true })('shared layer block', (it) => {
  it.effect('Should_SeeAnEmptyStore_When_NoTestHasWrittenYet', () =>
    Effect.gen(function*() {
      const store = yield* Store
      expect(store.values).toEqual([])
      store.values.push(1)
    }))

  it.effect('Should_SeeTheFirstWrite_When_SharingOneBuild', () =>
    Effect.gen(function*() {
      const store = yield* Store
      expect(store.values).toEqual([1])
    }))
})
