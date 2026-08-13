import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

describe('Registry lifetime', () => {
  describe('in-flight guard', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('in-flight read is not removed during evaluation (no sweep while waiting)', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.callback<number>(() => {
          evalCount++
        }),
      )
      const r = Registry.make()
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      expect(Result.isInitial(value)).toBe(true)
      await Promise.resolve()
      const value2 = r.get(atom)
      expect(evalCount).toBe(1)
      expect(Result.isInitial(value2)).toBe(true)
      expect(value2.waiting).toBe(true)
    })

    it('in-flight read survives TTL expiry', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.callback<number>(() => {
          evalCount++
        }),
      )
      const r = Registry.make({ defaultIdleTTL: 100 })
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      expect(Result.isInitial(value)).toBe(true)
      await Promise.resolve()
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      const value2 = r.get(atom)
      expect(evalCount).toBe(1)
      expect(Result.isInitial(value2)).toBe(true)
    })
  })
})
