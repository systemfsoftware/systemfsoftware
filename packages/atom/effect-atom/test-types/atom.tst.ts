import { Atom } from '@systemfsoftware/effect-atom'
import { Context, Effect, Layer, pipe } from 'effect'
import { describe, expect, it } from 'tstyche'

class NotRegistry extends Context.Service<NotRegistry, number>()(
  '@systemfsoftware/effect-atom/test-types/atom.tst/NotRegistry',
) {}

declare const registry: Atom.Registry.Registry
declare const count: Atom.Atom<number>
declare const ref: Atom.Ref.AtomRef<number>

describe('Atom.make', () => {
  it('a plain initial value makes a writable atom of that value', () => {
    expect(Atom.make(0)).type.toBe<Atom.Writable<number>>()
  })

  it('an Effect initial value reads as an AsyncResult with every channel pinned', () => {
    expect(Atom.make(Effect.succeed(1))).type.toBe<Atom.Atom<Atom.AsyncResult.Result<number, never>>>()
  })
})

describe('Atom.get', () => {
  it('answers through the Current registry service with every channel pinned', () => {
    expect(Atom.get(count)).type.toBe<Effect.Effect<number, never, Atom.Registry.Current>>()
  })
})

describe('Atom.Registry.layer', () => {
  it('accepts the Current registry tag and refuses a tag of another shape', () => {
    expect(Atom.Registry.layer).type.toBeCallableWith(Atom.Registry.Current)
    expect(Atom.Registry.layer(Atom.Registry.Current)).type.toBe<Layer.Layer<Atom.Registry.Current>>()
    expect(Atom.Registry.layer).type.not.toBeCallableWith(NotRegistry)
  })
})

describe('dual operations', () => {
  it('registry get accepts data-first and data-last calls', () => {
    expect(Atom.Registry.get).type.toBeCallableWith(registry, count)
    expect(Atom.Registry.get(registry, count)).type.toBe<number>()
    expect(Atom.Registry.get(count)).type.toBe<(self: Atom.Registry.Registry) => number>()
    expect(pipe(registry, Atom.Registry.get(count))).type.toBe<number>()
  })

  it('ref set accepts data-first and data-last calls', () => {
    expect(Atom.Ref.make(0)).type.toBe<Atom.Ref.AtomRef<number>>()
    expect(Atom.Ref.set).type.toBeCallableWith(ref, 1)
    expect(Atom.Ref.set(ref, 1)).type.toBe<Atom.Ref.AtomRef<number>>()
    expect(Atom.Ref.set(1)).type.toBe<(self: Atom.Ref.AtomRef<number>) => Atom.Ref.AtomRef<number>>()
    expect(pipe(ref, Atom.Ref.set(1))).type.toBe<Atom.Ref.AtomRef<number>>()
  })
})
