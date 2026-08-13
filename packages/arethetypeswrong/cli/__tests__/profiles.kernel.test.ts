import { it } from '@effect/vitest'
import { Schema } from 'effect'
import { describe, expect } from 'vitest'

import { applyProfile, ApplyProfileCommand, ApplyProfileDecision } from '../src/profiles.kernel.js'

const commandFor = (profileName: 'strict' | 'node16' | 'esm-only', ignoreResolutions?: ReadonlyArray<string>) =>
  new ApplyProfileCommand({
    profileName,
    request: ignoreResolutions === undefined ? {} : { ignoreResolutions },
  })

describe('applyProfile workflow', () => {
  it('keeps the strict profile free of added resolutions', () => {
    expect(applyProfile(commandFor('strict', ['bundler'])).ignoreResolutions).toEqual(['bundler'])
  })

  it('returns an empty list for the strict profile with no request list', () => {
    expect(applyProfile(commandFor('strict')).ignoreResolutions).toEqual([])
  })

  it('appends node10 for the node16 profile', () => {
    expect(applyProfile(commandFor('node16', ['bundler'])).ignoreResolutions).toEqual(['bundler', 'node10'])
  })

  it('appends node10 then node16-cjs for the esm-only profile', () => {
    expect(applyProfile(commandFor('esm-only', ['bundler'])).ignoreResolutions).toEqual([
      'bundler',
      'node10',
      'node16-cjs',
    ])
  })

  it('returns the profile list alone when the request has no ignoreResolutions', () => {
    expect(applyProfile(commandFor('esm-only')).ignoreResolutions).toEqual(['node10', 'node16-cjs'])
  })

  it('preserves duplicates when the request already contains a profile resolution', () => {
    expect(applyProfile(commandFor('node16', ['node10'])).ignoreResolutions).toEqual(['node10', 'node10'])
  })

  it('decodes a wire value carrying the canonical command tag', () => {
    const decoded = Schema.decodeSync(ApplyProfileCommand)({
      _tag: 'ApplyProfileCommand',
      profileName: 'node16',
      request: { ignoreResolutions: ['bundler'] },
    })
    expect(decoded.profileName).toBe('node16')
    expect(decoded.request).toEqual({ ignoreResolutions: ['bundler'] })
  })

  it('decodes a wire value carrying the canonical decision tag', () => {
    const decoded = Schema.decodeSync(ApplyProfileDecision)({
      _tag: 'ApplyProfileDecision',
      ignoreResolutions: ['node10'],
    })
    expect(decoded.ignoreResolutions).toEqual(['node10'])
  })

  it('decodes every resolution kind literal the decision schema admits', () => {
    const decoded = Schema.decodeSync(ApplyProfileDecision)({
      _tag: 'ApplyProfileDecision',
      ignoreResolutions: ['node10', 'node16-cjs', 'node16-esm', 'bundler'],
    })
    expect(decoded.ignoreResolutions).toEqual(['node10', 'node16-cjs', 'node16-esm', 'bundler'])
  })
})
