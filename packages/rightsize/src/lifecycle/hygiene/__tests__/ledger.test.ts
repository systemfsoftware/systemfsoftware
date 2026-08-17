/**
 * Ledger kernel contracts (R6) — read-side grammar and the sweep's kill
 * discipline, over real temp cache dirs:
 *
 * - the parse gates accept ONLY library-created names/ids (a hostile or
 *   torn cache dir must never turn ledger write access into arbitrary
 *   container deletion through the reaper);
 * - a dead run's reap is two-phase — every sandbox stop/remove precedes
 *   every network removal, because the ledger's network row arrives before
 *   its sandbox rows and `docker network rm` fails while members exist;
 * - foreign entries never reach the kill argv;
 * - liveness is conservative: an undeterminable start time skips the run
 *   this pass (a failed probe is never a kill verdict).
 *
 * No `async` anywhere: the effect language-service plugin's
 * `effect(asyncFunction)` rule bans raw async in this tree — I/O is
 * promise-chained or Effect-shaped (the repo's own convention).
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  dockerKillCommands,
  NETWORK_ID_PATTERN,
  parseLedgerEntry,
  runEntriesPath,
  runRecordPath,
  runsDir,
  SANDBOX_NAME_PATTERN,
  sweepOnce,
  writeRunRecord,
} from '../ledger.js'

const tmpDirs: string[] = []

const makeCacheDir = (): Promise<string> => {
  const created = fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-ledger-'))
  tmpDirs.push(path.join(os.tmpdir(), 'rightsize-ledger-'))
  return created
}

afterEach(() => Promise.all(tmpDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true }))))

// =============================================================================
// Read-side grammar (fix: hostile/torn cache dirs parse to undefined)
// =============================================================================

describe('sweep ledger read-side grammar', () => {
  it('Should_AcceptTheLibraryNames_When_SpecConforms', () => {
    expect(SANDBOX_NAME_PATTERN.test('rz-0123abcd-1')).toBe(true)
    expect(SANDBOX_NAME_PATTERN.test('rz-0123abcd-42')).toBe(true)
    expect(SANDBOX_NAME_PATTERN.test('rz-reuse-0123456789ab')).toBe(true)
  })

  it('Should_RejectForeignNames_When_NameIsNotLibraryOwned', () => {
    for (
      const foreign of [
        'victim',
        'nginx',
        'rz-test',
        'rz-zzzz-1', // run id not hex
        'rz-0123abcd', // missing the sequence
        'rz-0123abcd-', // empty sequence
        'rz-0123abcd-1x', // non-numeric sequence
        'rz-0123abcd-1-extra',
        'rz-reuse-n0thex-n0thex',
        'prz-0123abcd-1',
        'rz-0123abcd-1\nvictim',
      ]
    ) {
      expect(SANDBOX_NAME_PATTERN.test(foreign)).toBe(false)
    }
  })

  it('Should_AcceptNetworkIds_When_IdIsLibraryCreated', () => {
    expect(NETWORK_ID_PATTERN.test('rz-net-fedc1234')).toBe(true)
    for (
      const foreign of [
        'rz-net-fedc123', // too short
        'rz-net-fedc12345', // too long
        'rz-net-zzzz9999', // non-hex
        'fedc1234',
        'network-fedc1234',
        'rz-fedc1234',
        '',
      ]
    ) {
      expect(NETWORK_ID_PATTERN.test(foreign)).toBe(false)
    }
  })

  it('Should_ParseConformingAndSkipForeign_When_MixedLinesGiven', () => {
    expect(parseLedgerEntry('{"kind":"sandbox","backend":"docker","name":"rz-0123abcd-1"}')).toEqual({
      kind: 'sandbox',
      backend: 'docker',
      name: 'rz-0123abcd-1',
    })
    expect(parseLedgerEntry('{"kind":"network","id":"rz-net-fedc1234"}')).toEqual({
      kind: 'network',
      id: 'rz-net-fedc1234',
    })
    expect(parseLedgerEntry('{"kind":"sandbox","backend":"docker","name":"anything-goes"}')).toBeUndefined()
    expect(parseLedgerEntry('{"kind":"network","id":"anything-goes"}')).toBeUndefined()
    expect(parseLedgerEntry('{"kind":"sandbox","backend":"docker","name":"rz-0123abcd-1","id":"abc"}')).toEqual({
      kind: 'sandbox',
      backend: 'docker',
      name: 'rz-0123abcd-1',
      id: 'abc',
    })
  })
})

// =============================================================================
// The reap pass: argv order, foreign exclusion, conservative liveness
// =============================================================================

const dockerKill = dockerKillCommands()

const deadTimeSource = {
  isAlive: () => false,
  startedIso: () => Promise.resolve(undefined),
}

/** The sweep's post-reap contract: the run's files no longer exist. A surviving file rejects the test. */
const assertRunPruned = (cacheDir: string, runId: string): Promise<void> =>
  Promise.all([
    fsp.access(runRecordPath(cacheDir, runId)).then(
      () => {
        throw new Error(`run record '${runId}' was not pruned by the sweep`)
      },
      () => undefined,
    ),
    fsp.access(runEntriesPath(cacheDir, runId)).then(
      () => {
        throw new Error(`run entries '${runId}' were not pruned by the sweep`)
      },
      () => undefined,
    ),
  ]).then(() => undefined)

describe('sweepOnce reap pass', () => {
  it('Should_KillSandboxesBeforeNetworks_When_ReapingADeadRun', () => {
    const argv: string[][] = []
    return makeCacheDir().then((cacheDir) => {
      const runId = '0123abcd'
      return writeRunRecord(cacheDir, runId, {
        pid: 42_424_242,
        startedIso: '2020-01-01T00:00:00.000Z',
        backend: 'docker',
      })
        .then(() =>
          fsp.mkdir(runsDir(cacheDir), { recursive: true }).then(() =>
            // The real ledger order: the network row precedes the sandbox
            // rows (the network is ensured before the create/start loop).
            fsp.writeFile(
              runEntriesPath(cacheDir, runId),
              [
                JSON.stringify({ kind: 'network', id: 'rz-net-fedc1234' }),
                JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-7' }),
                JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-8' }),
                JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'victim-9' }),
                JSON.stringify({ kind: 'network', id: 'rz-net-zzzz9999' }),
                JSON.stringify({ kind: 'network', id: 'some-other-network' }),
              ].join('\n') + '\n',
            )
          )
        )
        .then(() =>
          sweepOnce({
            cacheDir,
            thisRunId: 'ffffffff',
            kill: dockerKill,
            runKill: (words) => argv.push([...words]),
            timeSource: deadTimeSource,
          })
        )
        .then(() => {
          const sandboxKills = argv.filter((words) => words[0] === 'docker' && words[1] === 'rm')
          expect(sandboxKills.map((words) => words[3])).toEqual(['rz-0123abcd-7', 'rz-0123abcd-8'])
          const networkKills = argv.filter((words) => words[1] === 'network')
          expect(networkKills).toEqual([['docker', 'network', 'rm', 'rz-net-fedc1234']])

          // Phase ordering: every sandbox kill precedes every network kill.
          expect(sandboxKills.length).toBeGreaterThan(0)
          const lastSandboxIndex = argv.findIndex((words) => words === sandboxKills[sandboxKills.length - 1])
          const firstNetworkIndex = argv.findIndex((words) => words === networkKills[0])
          expect(lastSandboxIndex).toBeLessThan(firstNetworkIndex)

          // The run's files were pruned once nothing was left tracked.
          return assertRunPruned(cacheDir, runId)
        })
    })
  })

  it('Should_SkipKills_When_LivenessIsUndeterminable', () => {
    const argv: string[][] = []
    return makeCacheDir().then((cacheDir) => {
      const runId = '0123abcd'
      return writeRunRecord(cacheDir, runId, {
        pid: 42_242_242,
        startedIso: '2020-01-01T00:00:00.000Z',
        backend: 'docker',
      })
        .then(() => fsp.mkdir(runsDir(cacheDir), { recursive: true }))
        .then(() =>
          fsp.writeFile(
            runEntriesPath(cacheDir, runId),
            `${JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-7' })}\n`,
          )
        )
        .then(() =>
          // The probe claims the pid exists but cannot produce a start
          // time — the conservative verdict must be «skip», never a kill.
          sweepOnce({
            cacheDir,
            thisRunId: 'ffffffff',
            kill: dockerKill,
            runKill: (words) => argv.push([...words]),
            timeSource: {
              isAlive: () => true,
              startedIso: () => Promise.resolve(undefined),
            },
          })
        )
        .then(() => {
          expect(argv).toEqual([])
          return Promise.all([
            fsp.access(runEntriesPath(cacheDir, runId)).then(() => undefined),
            fsp.access(runRecordPath(cacheDir, runId)).then(() => undefined),
          ])
        })
    })
  })
})
