/**
 * repo/tag splitting acceptance tests (behavioral reference: upstream
 * rightsize-node `splitRepoTag`): the last-colon-after-last-slash rule, the
 * `latest` default, and the digest pass-through.
 */
import { describe, expect, it } from 'vitest'
import { splitRepoTag } from '../repotag.kernel.js'

describe('splitRepoTag', () => {
  it('Should_SplitTheTag_When_TheLastColonFollowsTheLastSlash', () => {
    expect(splitRepoTag('redis:8.6-alpine')).toEqual(['redis', '8.6-alpine'])
    expect(splitRepoTag('ghcr.io/org/image:1.2.3')).toEqual(['ghcr.io/org/image', '1.2.3'])
    expect(splitRepoTag('localhost:5000/redis')).toEqual(['localhost:5000/redis', 'latest'])
  })

  it('Should_DefaultToLatest_When_NoTagIsPresent', () => {
    expect(splitRepoTag('alpine')).toEqual(['alpine', 'latest'])
    expect(splitRepoTag('ghcr.io/org/image')).toEqual(['ghcr.io/org/image', 'latest'])
  })

  it('Should_LeaveDigestReferencesUnsplittable_When_TheSha256PinsTheImage', () => {
    const digest = 'alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    expect(splitRepoTag(digest)).toEqual([digest, ''])
  })
})
