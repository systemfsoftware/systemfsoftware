import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { describe, expect } from 'vitest'

import {
  allResolutionKinds,
  allResolutionOptions,
  getResolutionKinds,
  getResolutionOption,
  isDefined,
  isResolutionKind,
  isResolutionOption,
} from '../src/resolution-kind.kernel.js'

describe('resolution-kind kernel', () => {
  it.prop(
    'getResolutionOption(getResolutionKinds(o)) maps kinds back to the original option',
    [fc.constantFrom(...allResolutionOptions)],
    ([option]) => {
      const kinds = getResolutionKinds(option)
      expect(kinds.length).toBeGreaterThan(0)
      for (const kind of kinds) {
        expect(getResolutionOption(kind)).toBe(option)
      }
    },
  )

  it.prop(
    'allResolutionKinds maps to a known option via getResolutionOption',
    [fc.constantFrom(...allResolutionKinds)],
    ([kind]) => {
      const option = getResolutionOption(kind)
      expect(allResolutionOptions).toContain(option)
    },
  )

  it.prop(
    'isResolutionKind returns true iff the string appears in allResolutionKinds',
    [fc.string()],
    ([s]) => {
      const expected = allResolutionKinds.includes(s as (typeof allResolutionKinds)[number])
      expect(isResolutionKind(s)).toBe(expected)
    },
  )

  it.prop(
    'isResolutionOption returns true iff the string appears in allResolutionOptions',
    [fc.string()],
    ([s]) => {
      const expected = allResolutionOptions.includes(s as (typeof allResolutionOptions)[number])
      expect(isResolutionOption(s)).toBe(expected)
    },
  )

  it.prop(
    'isDefined returns true iff value is not undefined',
    [fc.option(fc.integer(), { nil: undefined })],
    ([value]) => {
      expect(isDefined(value)).toBe(value !== undefined)
    },
  )
})
