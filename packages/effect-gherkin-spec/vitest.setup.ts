import { isCI } from '@systemfsoftware/vitest-config'
import { Equal } from 'effect'
import * as fc from 'fast-check'
import { expect } from 'vitest'

const bothAreEqual = <A = unknown, B = unknown>(a: A, b: B): boolean => Equal.isEqual(a) && Equal.isEqual(b)

const hasAsymmetric = <A = unknown>(val: A, seen = new Set<object>()): boolean => {
  if (typeof val !== 'object' || val === null) return false
  if ('asymmetricMatch' in val) return true
  if (seen.has(val)) return false
  seen.add(val)
  return Object.values(val).some((child) => hasAsymmetric(child, seen))
}
expect.addEqualityTesters([
  <A = unknown, B = unknown>(a: A, b: B): boolean | undefined => {
    if (hasAsymmetric(a) || hasAsymmetric(b)) {
      return undefined
    }
    if (!bothAreEqual(a, b)) {
      return undefined
    }
    return Equal.equals(a, b)
  },
])

const numRuns = 100
if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns })
}
