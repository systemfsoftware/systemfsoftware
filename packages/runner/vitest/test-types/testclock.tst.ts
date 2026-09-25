import '../src/compat'
import type * as Duration from 'effect/Duration'
import type * as Effect from 'effect/Effect'
import * as TestClock from 'effect/TestClock'
import { describe, expect, it } from 'tstyche'

describe('effect/TestClock compat', () => {
  it('declares the v3 adjust behind the ambient path', () => {
    expect(TestClock.adjust).type.toBe<(duration: Duration.Input) => Effect.Effect<void, never, never>>()
    expect(TestClock.adjust).type.toBeCallableWith('1 second')
    expect(TestClock.adjust).type.not.toBeCallableWith(true)
  })

  it('moves the clock as a void Effect with every channel pinned', () => {
    expect(TestClock.adjust('1 second')).type.toBe<Effect.Effect<void, never, never>>()
  })
})
