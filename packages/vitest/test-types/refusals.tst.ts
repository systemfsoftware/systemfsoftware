import { describe, expect, it } from 'tstyche'
import {
  presenceMessage,
  refuseAsync,
  refuseBareEffect,
  refuseBoolean,
  refuseHook,
  refuseNoAssertion,
  refusePositionalProp,
  refuseUnprovided,
} from '../src/internal/refusals'
import type {
  AsyncRefusal,
  BareEffectRefusal,
  BooleanRefusal,
  HookRefusal,
  NoAssertionRefusal,
  PositionalPropRefusal,
  PresenceMessage,
  PresenceRefusal,
  UnprovidedRefusal,
} from '../src/internal/refusals'
import { expect as forkExpect } from '../src/mod'

describe('refusal texts for the expect surface (R6, R9)', () => {
  it('keeps one constant per refusal with its exact text', () => {
    expect(refuseBoolean).type.toBe<BooleanRefusal>()
    expect(refuseHook).type.toBe<HookRefusal>()
    expect(refuseNoAssertion).type.toBe<NoAssertionRefusal>()
    expect(refuseAsync).type.toBe<AsyncRefusal>()
    expect(refuseBareEffect).type.toBe<BareEffectRefusal>()
    expect(refuseUnprovided).type.toBe<UnprovidedRefusal>()
    expect(refusePositionalProp).type.toBe<PositionalPropRefusal>()
    expect(presenceMessage('toBeDefined')).type.toBe<PresenceMessage<'toBeDefined'>>()
  })

  it('types the narrowed presence matchers as the refusal itself', () => {
    expect(forkExpect(1).toBeDefined).type.toBe<PresenceRefusal<'toBeDefined'>>()
    expect(forkExpect('value').toBeTruthy).type.toBe<PresenceRefusal<'toBeTruthy'>>()
    expect(forkExpect('').toBeFalsy).type.toBe<PresenceRefusal<'toBeFalsy'>>()
    expect(forkExpect(1).not.toBeNull).type.toBe<PresenceRefusal<'toBeNull'>>()
    expect(forkExpect(1).not.toBeUndefined).type.toBe<PresenceRefusal<'toBeUndefined'>>()
  })

  it('refuses a narrowed presence matcher at its call site, naming the rewrite', () => {
    // @ts-expect-error ✗ toBeDefined passes for almost any value the code returns. Assert the value: toEqual(expected); for a key that must exist: toHaveProperty(key).
    forkExpect(1).toBeDefined()

    expect(forkExpect(1).toEqual).type.toBeCallableWith(1)
  })

  it('keeps identity claims and type claims legal (R9)', () => {
    expect(forkExpect({ tag: 'shared' }).toBe).type.toBeCallableWith({ tag: 'shared' })
    expect(forkExpect(1).toBe).type.toBeCallableWith(1)
    expect(forkExpect('value').toBeTypeOf).type.toBeCallableWith('string')
    expect(forkExpect([]).toBeInstanceOf).type.toBeCallableWith(Array)
  })

  it('leaves the boolean argument to the lint rule (KTD9)', () => {
    expect(forkExpect).type.toBeCallableWith(1)
    expect(forkExpect).type.toBeCallableWith(true)
    expect(forkExpect).type.toBeCallableWith(false)
  })
})
