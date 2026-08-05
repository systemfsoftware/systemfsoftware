import { describe, expect, it } from '@effect/vitest'
import * as fc from 'effect/FastCheck'
import { decideNodeFate, type NodeLifetimeInput } from '../src/internal/node-lifetime.observer.js'

const arbInput: fc.Arbitrary<NodeLifetimeInput> = fc.record({
  keepAlive: fc.boolean(),
  listenerCount: fc.nat({ max: 10 }),
  childCount: fc.nat({ max: 10 }),
  isLive: fc.boolean(),
  isWaiting: fc.boolean(),
  idleTTL: fc.option(fc.nat({ max: 60_000 }), { nil: undefined }),
  defaultIdleTTL: fc.option(fc.nat({ max: 60_000 }), { nil: undefined }),
})

const arbPositiveTTL = fc.integer({ min: 1, max: 60_000 })

const eligible = (overrides: Partial<NodeLifetimeInput>): NodeLifetimeInput => ({
  keepAlive: false,
  listenerCount: 0,
  childCount: 0,
  isLive: true,
  isWaiting: false,
  idleTTL: undefined,
  defaultIdleTTL: undefined,
  ...overrides,
})

describe('decideNodeFate', () => {
  it.prop('fate exhaustiveness', [arbInput], ([input]) => {
    const fate = decideNodeFate(input)
    expect(['Alive', 'RemoveNow', 'RemoveAfterTtl']).toContain(fate._tag)
  })

  it.prop('in-flight guard: isWaiting yields Alive', [arbInput], ([input]) => {
    expect(decideNodeFate({ ...input, isWaiting: true })._tag).toBe('Alive')
  })

  it.prop('keepAlive guard yields Alive', [arbInput], ([input]) => {
    expect(decideNodeFate({ ...input, keepAlive: true })._tag).toBe('Alive')
  })

  it.prop('listener guard yields Alive', [arbInput], ([input]) => {
    expect(decideNodeFate({ ...input, listenerCount: input.listenerCount + 1 })._tag).toBe('Alive')
  })

  it.prop('child guard yields Alive', [arbInput], ([input]) => {
    expect(decideNodeFate({ ...input, childCount: input.childCount + 1 })._tag).toBe('Alive')
  })

  it.prop('not-live guard yields Alive', [arbInput], ([input]) => {
    expect(decideNodeFate({ ...input, isLive: false })._tag).toBe('Alive')
  })

  it.prop(
    'eligible with idleTTL=0 yields RemoveNow',
    [fc.option(fc.nat({ max: 60_000 }), { nil: undefined })],
    ([defaultTTL]) => {
      expect(decideNodeFate(eligible({ idleTTL: 0, defaultIdleTTL: defaultTTL }))._tag).toBe('RemoveNow')
    },
  )

  it('eligible with no TTL yields RemoveNow', () => {
    expect(decideNodeFate(eligible({ idleTTL: undefined, defaultIdleTTL: undefined }))._tag).toBe('RemoveNow')
  })

  it.prop('per-atom TTL overrides default', [arbPositiveTTL, arbPositiveTTL], ([perAtom, defaultTTL]) => {
    const fate = decideNodeFate(eligible({ idleTTL: perAtom, defaultIdleTTL: defaultTTL }))
    expect(fate._tag).toBe('RemoveAfterTtl')
    if (fate._tag === 'RemoveAfterTtl') {
      expect(fate.ttlMillis).toBe(perAtom)
    }
  })

  it.prop('default TTL used when no per-atom override', [arbPositiveTTL], ([defaultTTL]) => {
    const fate = decideNodeFate(eligible({ idleTTL: undefined, defaultIdleTTL: defaultTTL }))
    expect(fate._tag).toBe('RemoveAfterTtl')
    if (fate._tag === 'RemoveAfterTtl') {
      expect(fate.ttlMillis).toBe(defaultTTL)
    }
  })
})
