import { assert, beforeEach, describe, expect, it, vitest } from '@effect/vitest'
import { afterEach } from '@effect/vitest'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import * as Effect from 'effect/Effect'

describe('Registry lifetime', () => {
  beforeEach(() => {
    vitest.useFakeTimers()
  })
  afterEach(() => {
    vitest.useRealTimers()
  })

  describe('in-flight guard', () => {
    it('in-flight read survives unsubscribe (no sweep during evaluation)', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.async<number>(() => {
          evalCount++
        }),
      )
      const r = Registry.make()
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isInitial(value))
      await new Promise((resolve) => resolve(null))
      const value2 = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isInitial(value2))
      assert.isTrue(value2.waiting)
    })

    it('in-flight read survives TTL expiry', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.async<number>(() => {
          evalCount++
        }),
      )
      const r = Registry.make({ defaultIdleTTL: 100 })
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isInitial(value))
      await new Promise((resolve) => resolve(null))
      vitest.advanceTimersByTime(500)
      await new Promise((resolve) => resolve(null))
      const value2 = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isInitial(value2))
    })
  })

  describe('settle-then-sweep', () => {
    it('settled atom with zero listeners is swept after TTL', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      )
      const r = Registry.make({ defaultIdleTTL: 100 })
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isSuccess(value))
      await new Promise((resolve) => resolve(null))
      vitest.advanceTimersByTime(200)
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(2)
    })

    it('settled atom with zero listeners and no TTL is swept on next microtask', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      )
      const r = Registry.make()
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isSuccess(value))
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(2)
    })

    it('settled atom with per-atom TTL override uses the override', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      ).pipe(Atom.setIdleTTL(50))
      const r = Registry.make({ defaultIdleTTL: 10_000 })
      r.get(atom)
      expect(evalCount).toBe(1)
      await new Promise((resolve) => resolve(null))
      vitest.advanceTimersByTime(11_000)
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(2)
    })

    it('settled atom survives within TTL window', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      ).pipe(Atom.setIdleTTL(500))
      const r = Registry.make({ defaultIdleTTL: 50 })
      r.get(atom)
      expect(evalCount).toBe(1)
      await new Promise((resolve) => resolve(null))
      vitest.advanceTimersByTime(100)
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(1)
      await new Promise((resolve) => resolve(null))
      vitest.advanceTimersByTime(600)
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(2)
    })
  })

  describe('keepAlive and listener guards', () => {
    it('keepAlive atom is never swept', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      ).pipe(Atom.keepAlive)
      const r = Registry.make()
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isSuccess(value))
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(1)
    })

    it('atom with active listeners is never swept', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      )
      const r = Registry.make()
      r.subscribe(atom, () => {}, { immediate: true })
      expect(evalCount).toBe(1)
      await new Promise((resolve) => resolve(null))
      r.get(atom)
      expect(evalCount).toBe(1)
    })
  })

  describe('stale node eligibility', () => {
    it('invalidated node with zero listeners is removed', async () => {
      let evalCount = 0
      const source = Atom.make(0)
      const derived = Atom.readable((get) => {
        evalCount++
        return get(source) * 2
      })
      const r = Registry.make()
      r.subscribe(derived, () => {}, { immediate: true })
      expect(evalCount).toBe(1)
      r.set(source, 1)
      await new Promise((resolve) => resolve(null))
      r.get(derived)
      expect(evalCount).toBe(2)
    })
  })

  describe('mount holds the node', () => {
    it('mounted atom is never removed while mounted', async () => {
      let evalCount = 0
      const atom = Atom.make(
        Effect.sync(() => {
          evalCount++
          return 42
        }),
      )
      const r = Registry.make()
      const unmount = r.mount(atom)
      expect(evalCount).toBe(1)
      await new Promise((resolve) => resolve(null))
      const value = r.get(atom)
      expect(evalCount).toBe(1)
      assert.isTrue(Result.isSuccess(value))
      unmount()
    })
  })

  describe('children guard', () => {
    it('node with children is never removed', async () => {
      const parent = Atom.make(0)
      const child = Atom.writable(
        (get) => get(parent),
        (ctx, value: number) => ctx.set(parent, value),
      )
      const r = Registry.make()
      r.subscribe(child, () => {}, { immediate: true })
      await new Promise((resolve) => resolve(null))
      expect(r.get(parent)).toEqual(0)
    })
  })
})
