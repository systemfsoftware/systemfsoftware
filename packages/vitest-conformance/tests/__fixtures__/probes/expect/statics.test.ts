import { describe, it } from '@effect/vitest'

describe('the refused statics', () => {
  it('Should_RefuseTheAnythingStatic_When_ItIsReadButNotCalled', function*({ expect }) {
    const read = String(expect.anything)
    yield* expect(read).toEqual('unreachable')
  })

  it('Should_RefuseThePollStatic_When_ItIsReadButNotCalled', function*({ expect }) {
    const read = String(expect.poll)
    yield* expect(read).toEqual('unreachable')
  })

  it('Should_RefuseTheSoftStatic_When_ItIsReadButNotCalled', function*({ expect }) {
    const read = String(expect.soft)
    yield* expect(read).toEqual('unreachable')
  })
})
