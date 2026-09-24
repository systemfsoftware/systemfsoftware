import { beforeEach, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

interface Order {
  readonly id: number
  readonly status: 'Pending'
}

const pending: Order = { id: 1, status: 'Pending' }

describe('the habit hook name is refused', () => {
  // @ts-expect-error ✗ hooks share state between tests. Build what a test needs inside it; services come fresh per test from layer(Service.layer)((it) => { ... }).
  beforeEach(() => Effect.void)

  it('Should_RefuseTheHook_When_TheSetupIsDeclaredOutsideTheBody', function*({ expect }) {
    yield* expect(pending).toEqual({ id: 1, status: 'Pending' })
  })
})
