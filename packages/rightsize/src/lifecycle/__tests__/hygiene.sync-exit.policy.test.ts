/**
 * The sync-exit registry policy (R6) — the process-exit teardown contract:
 * registration keys by container id, clean teardown unregisters, and the
 * synchronous exit pass is total (never throws, never skips a sibling).
 */
import { describe, expect, it } from 'vitest'

import {
  _isRegisteredForTests,
  _resetForTests,
  _runAllForTests,
  registerSyncCleanup,
  syncCleanupIds,
  unregisterSyncCleanup,
} from '../hygiene/sync-exit.js'

describe('hygiene sync-exit policy', () => {
  it('Should_ListRegisteredIds_When_Registered', () => {
    _resetForTests()
    registerSyncCleanup('cid-a', () => {})
    registerSyncCleanup('cid-b', () => {})
    expect([...syncCleanupIds()].sort()).toEqual(['cid-a', 'cid-b'])
    expect(_isRegisteredForTests('cid-a')).toBe(true)
  })

  it('Should_Unregister_When_CleanTeardownRan', () => {
    _resetForTests()
    registerSyncCleanup('cid-a', () => {})
    unregisterSyncCleanup('cid-a')
    expect(syncCleanupIds()).toEqual([])
  })

  it('Should_RunAllRegisteredCleanups_When_ExitPassRuns', () => {
    _resetForTests()
    const ran: string[] = []
    registerSyncCleanup('cid-a', () => ran.push('a'))
    registerSyncCleanup('cid-b', () => ran.push('b'))
    _runAllForTests()
    expect(ran).toEqual(['a', 'b'])
    expect(syncCleanupIds()).toEqual([]) // the exit pass drains the registry
  })

  it('Should_NotThrowAndRunSiblings_When_OneCleanupThrows', () => {
    _resetForTests()
    const ran: string[] = []
    registerSyncCleanup('cid-thrower', () => {
      throw new Error('boom')
    })
    registerSyncCleanup('cid-steady', () => ran.push('steady'))
    expect(() => _runAllForTests()).not.toThrow()
    expect(ran).toEqual(['steady'])
  })

  it('Should_Reset_When_TestSeamClears', () => {
    _resetForTests()
    registerSyncCleanup('cid-a', () => {})
    _resetForTests()
    expect(syncCleanupIds()).toEqual([])
  })
})
