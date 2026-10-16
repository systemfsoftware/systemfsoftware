import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const ran = (body: string): Effect.Effect<string> =>
  Effect.sync(() => {
    console.log(`rerun-body: ${body}`)
    return body
  })

it('Should_RunTheRegisteredBodyTwice_When_NoRerunBodyIsGiven', function*({ expect }) {
  const body = yield* ran('default')
  yield* expect(body).toEqual('default')
})

it('Should_RunTheRerunBodySecond_When_TheRegistrationNamesOne', function*({ expect }) {
  const body = yield* ran('registered')
  yield* expect(body).toEqual('registered')
}, {
  rerun: function*({ expect }) {
    const body = yield* ran('rerun')
    yield* expect(body).toEqual('rerun')
  },
})

it('Should_FailAsLeakedState_When_TheRerunBodyFails', function*({ expect }) {
  const body = yield* ran('passes first')
  yield* expect(body).toEqual('passes first')
}, {
  rerun: function*({ expect }) {
    const body = yield* ran('fails second')
    yield* expect(body).toEqual('passes first')
  },
})
