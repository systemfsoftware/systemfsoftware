import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { describe, expect, it } from 'tstyche'
import * as Fork from '../src/mod'

declare const returnsAPromise: () => Promise<void>
declare const returnsAnEffect: () => Effect.Effect<void>
declare const runsSync: () => void

describe('the fork publishes no check of its own (R1, AE6)', () => {
  it('keeps expect and assert off the entry', () => {
    expect(Fork).type.not.toHaveProperty('expect')
    expect(Fork).type.not.toHaveProperty('assert')
  })

  it('keeps the removed integration helpers off the entry', () => {
    expect(Fork).type.not.toHaveProperty('owned')
    expect(Fork).type.not.toHaveProperty('recordAssertion')
  })

  it('keeps the removed utils helpers off the entry', () => {
    expect(Fork).type.not.toHaveProperty('fail')
    expect(Fork).type.not.toHaveProperty('deepStrictEqual')
    expect(Fork).type.not.toHaveProperty('strictEqual')
    expect(Fork).type.not.toHaveProperty('assertTrue')
    expect(Fork).type.not.toHaveProperty('throws')
  })
})

describe('the test callback is the only expect (R1, R2)', () => {
  it('hands the check to a generator body', () => {
    Fork.it('a test that yields its check', function*({ expect: check }) {
      yield* check(1).toEqual(1)
    })
  })

  it('hands the check to a generator body on the real clock', () => {
    Fork.it.live('a test that yields its check on the real clock', function*({ expect: check }) {
      yield* check(1).toEqual(1)
    })
  })

  it('hands the check to a generator body under a layer block', () => {
    Fork.layer(Layer.empty)((block) => {
      block('a test that yields its check under a layer', function*({ expect: check }) {
        yield* check(1).toEqual(1)
      })
    })
  })

  it('hands a row and the check to a generator body', () => {
    Fork.it.each([{ quantity: 2 }])('a test that yields its check per row', function*(row, { expect: check }) {
      yield* check(row.quantity).toEqual(2)
    })
  })

  it('refuses a body that is not the generator itself (R2)', () => {
    expect(Fork.it).type.not.toBeCallableWith('a test', runsSync)
    expect(Fork.it).type.not.toBeCallableWith('a test', returnsAnEffect)
    expect(Fork.it).type.not.toBeCallableWith('a test', returnsAPromise)
  })
})
