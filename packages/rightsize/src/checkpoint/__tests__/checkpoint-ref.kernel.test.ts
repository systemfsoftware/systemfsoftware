/**
 * Checkpoint ref minting tests (R14) — the backend-specific opaque refs: a
 * docker image tag with a deterministic named suffix, an absolute msb path
 * under the cache dir, and the random suffix for nameless captures. Pure.
 */
import { describe, expect, it } from 'vitest'

import { checkpointRef, DOCKER_CHECKPOINT_REPO, MSB_CHECKPOINT_PREFIX } from '../checkpoint-ref.js'

describe('checkpointRef — docker', () => {
  it('Should_MintTheDeterministicTag_When_TheNameIsGiven', () => {
    expect(checkpointRef('docker', 'seeded-db', '/cache')).toBe(`${DOCKER_CHECKPOINT_REPO}:seeded-db`)
  })

  it('Should_MintARandomSuffix_When_NoNameIsGiven', () => {
    expect(checkpointRef('docker', undefined, '/cache')).toMatch(/^rightsize\/checkpoint:[0-9a-f]{12}$/)
  })
})

describe('checkpointRef — msb', () => {
  it('Should_MintAnAbsolutePath_When_TheNameIsGiven', () => {
    const ref = checkpointRef('msb', 'seeded-db', '/cache')
    expect(ref).toBe('/cache/checkpoints/rz-ckpt-seeded-db')
  })

  it('Should_MintAnAbsolutePathWithARandomSuffix_When_NoNameIsGiven', () => {
    expect(checkpointRef('msb', undefined, '/cache')).toMatch(/^\/cache\/checkpoints\/rz-ckpt-[0-9a-f]{12}$/)
  })

  it('Should_ResolveARelativeCacheDirToAbsolute_When_Provided', () => {
    const ref = checkpointRef('msb', 'seeded-db', 'relative/cache')
    expect(ref.startsWith('/')).toBe(true)
    expect(ref.endsWith(`${MSB_CHECKPOINT_PREFIX}seeded-db`)).toBe(true)
  })
})
