import { describe, expect, it } from 'tstyche'
import * as Fork from '../src/mod'

describe('the negated asymmetric statics (R6)', () => {
  it('builds a negated matcher from its expected argument, and only from those four', () => {
    Fork.it('a test that reads the negated statics', function*({ expect: check }) {
      expect(check.not.stringContaining).type.toBeCallableWith('SIDE EFFECT RAN')
      expect(check.not.stringContaining).type.not.toBeCallableWith()
      expect(check.not.stringMatching).type.toBeCallableWith(/coverage/)
      expect(check.not.stringMatching).type.not.toBeCallableWith(1)
      expect(check.not.objectContaining).type.toBeCallableWith({ message: 'ok' })
      expect(check.not.objectContaining).type.not.toBeCallableWith()
      expect(check.not.arrayContaining).type.toBeCallableWith([1])
      expect(check.not.arrayContaining).type.not.toBeCallableWith()

      expect(check).type.toHaveProperty('any')
      expect(check.not).type.not.toHaveProperty('any')
      expect(check.not).type.not.toHaveProperty('anything')
      expect(check.not).type.not.toHaveProperty('closeTo')
      expect(check.not).type.not.toHaveProperty('schemaMatching')

      expect(check.not.stringContaining('SIDE EFFECT RAN')).type.toBe<object>()

      yield* check(check.not.stringContaining('SIDE EFFECT RAN')).toEqual({ message: 'ok' })
    })
  })
})
