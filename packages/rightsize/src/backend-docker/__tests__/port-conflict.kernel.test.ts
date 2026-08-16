/**
 * Port-conflict classifier acceptance tests (behavioral reference: upstream
 * rightsize-node `src/backend-docker/port-conflict.ts`).
 */
import { describe, expect, it } from 'vitest'
import { isPortBindConflictMessage } from '../port-conflict.js'

describe('isPortBindConflictMessage', () => {
  it('Should_ClassifyKnownDaemonPhrasings_When_HostPortIsTaken', () => {
    expect(isPortBindConflictMessage('driver failed programming external connectivity: address already in use')).toBe(
      true,
    )
    expect(isPortBindConflictMessage('Bind for 0.0.0.0:6379 failed: port is already allocated')).toBe(true)
    expect(isPortBindConflictMessage('ALREADY ALLOCATED (case-insensitive)')).toBe(true)
  })

  it('Should_RefuseToClassify_When_NoBindPhrasingAppears', () => {
    expect(isPortBindConflictMessage('no such image')).toBe(false)
    expect(isPortBindConflictMessage('container already stopped')).toBe(false)
    expect(isPortBindConflictMessage('')).toBe(false)
  })
})
