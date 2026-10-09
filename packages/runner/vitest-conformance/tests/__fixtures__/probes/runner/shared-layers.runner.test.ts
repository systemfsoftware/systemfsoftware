import { layer } from '@systemfsoftware/vitest'
import { Context } from 'effect'
import { Layer } from 'effect'

class Store extends Context.Service<Store, { readonly values: Array<number> }>()(
  'vitest-conformance/probes/runner/shared-layers/Store',
) {
  static layer = Layer.succeed(Store, { values: [] })
}

layer(Store.layer, { shared: true })('shared layer block', (it) => {
  it('Should_SeeAnEmptyStore_When_NoTestHasWrittenYet', function*({ expect }) {
    const store = yield* Store
    yield* expect(store.values).toEqual([])
    store.values.push(1)
  })

  it('Should_SeeTheFirstWrite_When_SharingOneBuild', function*({ expect }) {
    const store = yield* Store
    yield* expect(store.values).toEqual([1])
  })
})
