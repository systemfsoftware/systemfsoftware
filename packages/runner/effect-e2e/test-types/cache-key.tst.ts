import type * as Redacted from 'effect/Redacted'
import { describe, expect, it } from 'tstyche'

import type { CacheKeyContext, EngineIdentity, KeyDigest, ParamValue } from '../src/cache/key.schema.js'

describe('CacheKeyContext', () => {
  it('keys exactly the fields design 9.1 includes', () => {
    expect<keyof CacheKeyContext>().type.toBe<
      'project' | 'test' | 'target' | 'engine' | 'app' | 'instruction' | 'params' | 'slots' | 'agent'
    >()
  })

  it('names the engine by adapter and kind, never by version', () => {
    expect<keyof EngineIdentity>().type.toBe<'adapter' | 'kind'>()
  })
})

describe('ParamValue', () => {
  it('cannot carry a resolved secret value', () => {
    expect<ParamValue>().type.not.toBeAssignableFrom<Redacted.Redacted<string>>()
  })
})

describe('KeyDigest', () => {
  it('is not an arbitrary string', () => {
    expect<KeyDigest>().type.not.toBeAssignableFrom<string>()
  })
})
