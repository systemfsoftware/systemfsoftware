import type { TestIdentity } from '@systemfsoftware/vitest/failure'
import { throwFailureRecord } from '@systemfsoftware/vitest/failure'

type Opaque<A = unknown> = A

const fieldOf = (value: object, key: string): Opaque => Reflect.get(value, key)

const IDENTITY: TestIdentity = {
  package: '@systemfsoftware/vitest',
  file: 'tests/__fixtures__/failure-corpus/assertion-fields.ts',
  name: 'an assertion that fails',
}

const assertionShaped = (): object => ({
  name: 'AssertionError',
  message: 'expected 1 to deeply equal 2',
  actual: 1,
  expected: 2,
  showDiff: true,
  operator: 'strictEqual',
})

const wrapped = (): Error => new Error('the step failed', { cause: assertionShaped() })

export const assertionFields = (): object => {
  try {
    throwFailureRecord({ failure: wrapped(), spans: [], identity: IDENTITY, replay: undefined })
  } catch (thrown) {
    const error: object = thrown instanceof Error
      ? thrown
      : new Error('the record threw a non-error', { cause: thrown })
    return {
      actual: fieldOf(error, 'actual'),
      expected: fieldOf(error, 'expected'),
      showDiff: fieldOf(error, 'showDiff'),
      operator: fieldOf(error, 'operator'),
    }
  }
  return { actual: 'no error was thrown' }
}
