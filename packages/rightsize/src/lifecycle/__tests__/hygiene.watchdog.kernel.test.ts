/**
 * The reaper watchdog kernel (R6) — the detached, content-addressed sweep
 * script and its spawn contract: deterministic filename from the script's
 * own bytes, the argv contract, the spawn seam's command/argv, the one-time
 * bring-up gate (off → inert, sweep → no watchdog, on → watchdog spawned
 * once), and the active-ledger tracking round-trip. Promise-chained (the
 * effect TS profile bans async function declarations).
 */
import { Effect } from 'effect'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import { RunId } from '../../runtime/run-id.js'
import { dockerKillCommands, readLedgerEntries } from '../hygiene/ledger.js'
import {
  _activeLedgerForTests,
  _heldWatchdogForTests,
  _resetReaperForTests,
  ensureReaperInitialized,
  isLedgerActive,
  type ReaperInitDeps,
  spawnWatchdog,
  trackNetworkLedger,
  trackSandboxLedger,
  untrackNetworkLedger,
  untrackSandboxLedger,
  watchdogScriptContent,
  watchdogScriptFilename,
} from '../hygiene/watchdog.js'

const freshCache = (): Promise<string> => fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-watchdog-kernel-'))

const baseDeps = (cacheDir: string, mode: 'on' | 'sweep' | 'off'): ReaperInitDeps => ({
  cacheDir,
  backend: 'docker',
  kill: dockerKillCommands(),
  mode,
})

const runEffect = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect)

describe('hygiene watchdog kernel', () => {
  it('Should_DeriveFilename_When_HashedFromContentBytes', () => {
    const content = watchdogScriptContent()
    const filename = watchdogScriptFilename(content)
    expect(filename).toMatch(/^watchdog-[0-9a-f]{12}\.js$/)
    expect(watchdogScriptFilename(content)).toBe(filename) // stable
    expect(watchdogScriptFilename('other bytes')).not.toBe(filename) // content-addressed
  })

  it('Should_DescribeArgvContract_When_ProducingTheScript', () => {
    const content = watchdogScriptContent()
    expect(content).toContain('rightsize reaper watchdog')
    expect(content).toContain('<sandboxesPath> <networksPath> <recordPath>')
    expect(content).toContain('<stopCmd> <removeCmd> <removeNetCmd> <ownerPid>')
  })

  it('Should_SpawnWithLedgerArgv_When_SeamRemembersTheChild', () => {
    const spawned: Array<{ readonly command: string; readonly argv: ReadonlyArray<string> }> = []
    return Effect.runPromise(
      spawnWatchdog(
        { cacheDir: '/tmp/x', runId: 'run-1', ownerPid: 1234, kill: dockerKillCommands() },
        {
          spawnChild: (command, argv) => {
            spawned.push({ command, argv })
            return { close: () => {} }
          },
        },
      ),
    ).then((handle) => {
      expect(spawned).toHaveLength(1)
      expect(spawned[0]?.command).toContain('node') // process.execPath spawns the generated script
      expect(spawned[0]?.argv[0]).toContain('watchdog-')
      expect(spawned[0]?.argv.join(' ')).toContain('/tmp/x')
      expect(spawned[0]?.argv.join(' ')).toContain('1234')
      handle.close()
    })
  })

  it('Should_BringUpNothing_When_ModeOff', () =>
    freshCache().then((cache) => {
      _resetReaperForTests()
      runEffect(ensureReaperInitialized(baseDeps(cache, 'off')))
      expect(isLedgerActive()).toBe(false)
      expect(_activeLedgerForTests()).toBeUndefined()
    }))

  it('Should_TrackAndUntrackSandbox_When_LedgerIsActiveInSweepMode', () =>
    freshCache().then((cache) => {
      _resetReaperForTests()
      return Effect.runPromise(ensureReaperInitialized(baseDeps(cache, 'sweep'))).then(() => {
        expect(isLedgerActive()).toBe(true)
        expect(_heldWatchdogForTests()).toBeUndefined() // sweep = record + sweep only, no watchdog

        expect(runEffect(trackSandboxLedger({ kind: 'sandbox', backend: 'docker', name: 'rz-sweep-1' }))).toBe(true)
        return readLedgerEntries(cache, RunId.value).then((entries) => {
          expect(entries).toContainEqual({ kind: 'sandbox', backend: 'docker', name: 'rz-sweep-1' })
          untrackSandboxLedger('rz-sweep-1')
          return readLedgerEntries(cache, RunId.value).then((after) => expect(after).toEqual([]))
        })
      })
    }))

  it('Should_TrackAndUntrackNetworks_When_LedgerIsActive', () =>
    freshCache().then((cache) => {
      _resetReaperForTests()
      return Effect.runPromise(ensureReaperInitialized(baseDeps(cache, 'sweep'))).then(() => {
        expect(runEffect(trackNetworkLedger('net-armed'))).toBe(true)
        return readLedgerEntries(cache, RunId.value).then((entries) => {
          expect(entries).toContainEqual({ kind: 'network', id: 'net-armed' })
          untrackNetworkLedger('net-armed')
          return readLedgerEntries(cache, RunId.value).then((after) => expect(after).toEqual([]))
        })
      })
    }))

  it('Should_ReturnTheSameMemoizedEffect_When_InitializedTwice', () =>
    freshCache().then((cache) => {
      _resetReaperForTests()
      let spawns = 0
      const deps: ReaperInitDeps = {
        ...baseDeps(cache, 'on'),
        spawnChild: () => {
          spawns += 1
          return { close: () => {} }
        },
      }
      const first = ensureReaperInitialized(deps)
      const second = ensureReaperInitialized(deps)
      expect(first).toBe(second) // the memoized bring-up gate returns one effect instance
      return Effect.runPromise(first).then(() => {
        expect(spawns).toBe(1) // a failed/active bring-up is not re-created per launch
        expect(_heldWatchdogForTests()).toBeDefined()
      })
    }))

  it('Should_ExposeActiveLedgerLocation_When_BroughtUp', () =>
    freshCache().then((cache) => {
      _resetReaperForTests()
      return Effect.runPromise(ensureReaperInitialized(baseDeps(cache, 'sweep'))).then(() => {
        expect(_activeLedgerForTests()?.cacheDir).toBe(cache)
      })
    }))
})
