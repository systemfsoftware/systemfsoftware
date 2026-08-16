/**
 * Reap tests — the `decideReap` decision matrix (pure, zero I/O) and one
 * end-to-end sweep with a recording kill runner over a temp-dir ledger:
 * dead runs are reaped stop+remove (names from the ledger only), live runs
 * and other-backend runs are untouched, fresh-unparseable records are
 * skipped while stale ones are reaped, run files are deleted after a pass,
 * and a second pass is a no-op — foreign containers are structurally
 * unreachable (the kill argv carries exactly the seeded ledger names).
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Option, Result } from 'effect'
import { Effect, Layer } from 'effect'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  appendNetworkEntry,
  appendSandboxEntry,
  dockerKillCommands,
  writeRunRecord,
} from '../../lifecycle/hygiene/ledger.js'
import type { ProcessTimeSource } from '../../lifecycle/hygiene/ledger.js'
import { RightsizeConfig } from '../../runtime/config.js'
import { Selection } from '../../runtime/selection.workflow.js'
import {
  decideReap,
  reap,
  type ReapCommand,
  ReapFactContradictionError,
  type ReapRunFacts,
  ReapRuns,
  ReapSkipped,
} from '../reap.js'

// ---------------------------------------------------------------------------
// Pure decision matrix
// ---------------------------------------------------------------------------

const runFact = (overrides: Partial<ReapRunFacts> & { readonly runId: string }): ReapRunFacts => ({
  record: undefined,
  unparseableFresh: false,
  alive: false,
  ...overrides,
})

const command = (
  runs: ReadonlyArray<ReapRunFacts>,
  overrides: Partial<Omit<ReapCommand, '_tag' | 'runs'>> = {},
): ReapCommand => ({
  _tag: 'Reap',
  thisRunId: 'this-run',
  backend: 'docker',
  runs,
  ...overrides,
})

const expectSuccess = (input: ReapCommand, kind: typeof ReapSkipped | typeof ReapRuns) => {
  const decision = decideReap(input)
  expect(Result.isSuccess(decision)).toBe(true)
  expect(Result.getOrThrow(decision)).toBeInstanceOf(kind)
  return Result.getOrThrow(decision)
}

describe('decideReap — the kill-set decision', () => {
  it('Should_ReapDeadDockerRuns_When_TheirOwnersAreGone', () => {
    const planned = expectSuccess(
      command([
        runFact({ runId: 'r-dead', record: { pid: 1, startedIso: 'x', backend: 'docker' }, alive: false }),
      ]),
      ReapRuns,
    ) as ReapRuns
    expect(planned.runs).toEqual([{ runId: 'r-dead' }])
  })

  it('Should_SkipEverything_When_AllRunsAreAlive', () => {
    expectSuccess(
      command([
        runFact({ runId: 'r-live', record: { pid: 2, startedIso: 'x', backend: 'docker' }, alive: true }),
        runFact({ runId: 'r-live2', record: { pid: 3, startedIso: 'x', backend: 'docker' }, alive: true }),
      ]),
      ReapSkipped,
    )
  })

  it('Should_Skip_When_TheRunIsAliveOrOnAnotherBackendOrFreshUnparseable', () => {
    expectSuccess(
      command([
        runFact({ runId: 'r-alive', record: { pid: 1, startedIso: 'x', backend: 'docker' }, alive: true }),
        runFact({ runId: 'r-msb', record: { pid: 1, startedIso: 'x', backend: 'msb' }, alive: false }),
        runFact({ runId: 'r-fresh', record: undefined, unparseableFresh: true }),
      ]),
      ReapSkipped,
    )
  })

  it('Should_ReapAStaleUnparseableRun_When_ItsRecordIsMissingButOld', () => {
    const planned = expectSuccess(
      command([runFact({ runId: 'r-garbage', record: undefined, unparseableFresh: false })]),
      ReapRuns,
    ) as ReapRuns
    expect(planned.runs).toEqual([{ runId: 'r-garbage' }])
  })

  it('Should_RefuseACommand_When_GatheredFactsContradict', () => {
    const self = decideReap(
      command([runFact({ runId: 'this-run', record: { pid: 1, startedIso: 'x', backend: 'docker' }, alive: false })]),
    )
    expect(Result.isFailure(self)).toBe(true)
    expect(Option.isSome(Result.getFailure(self))).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(self))).toBeInstanceOf(ReapFactContradictionError)

    const freshWithRecord = decideReap(
      command([
        runFact({
          runId: 'r',
          record: { pid: 1, startedIso: 'x', backend: 'docker' },
          unparseableFresh: true,
          alive: false,
        }),
      ]),
    )
    expect(Result.isFailure(freshWithRecord)).toBe(true)
    expect(Option.isSome(Result.getFailure(freshWithRecord))).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(freshWithRecord))).toBeInstanceOf(ReapFactContradictionError)
  })
})

// ---------------------------------------------------------------------------
// One sweep pass over a temp ledger
// ---------------------------------------------------------------------------

const ALIVE_PID = 42_000

const timeSource: ProcessTimeSource = {
  isAlive: (pid: number) => pid === ALIVE_PID,
  startedIso: (pid: number) => Promise.resolve(pid === ALIVE_PID ? '2026-01-01T00:00:00.000Z' : undefined),
}

const withTempDir = <A>(body: (dir: string) => PromiseLike<A>): Promise<A> =>
  fsp.mkdtemp(join(os.tmpdir(), 'rz-reap-')).then((dir) =>
    body(dir).then(
      (value) => fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).then(() => value),
      (error: unknown) =>
        fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).then(() => Promise.reject(error)),
    )
  )

// ---------------------------------------------------------------------------
// One explicit sweep pass
// ---------------------------------------------------------------------------

const seed = (
  dir: string,
  runId: string,
  record: { readonly pid: number; readonly startedIso: string; readonly backend: 'docker' | 'msb' },
): Promise<void> => writeRunRecord(dir, runId, record).then(() => undefined)

describe('reap — one idempotent sweep pass', () => {
  it('Should_KillOnlyTheDeadRunsLedgerNames_When_TheOwnersAreGone', () =>
    withTempDir((dir) => {
      const killed: Array<readonly string[]> = []
      const runKill = (argv: ReadonlyArray<string>): void => {
        killed.push([...argv])
      }
      const seedDead = seed(dir, 'dead-docker', { pid: 1, startedIso: '2026-01-01T00:00:00.000Z', backend: 'docker' })
        .then(() =>
          appendSandboxEntry(dir, 'dead-docker', {
            kind: 'sandbox',
            backend: 'docker',
            name: 'rz-dead-1',
            id: 'dead-box',
          })
        )
        .then(() => appendNetworkEntry(dir, 'dead-docker', 'rz-net-dead'))
      const seedAlive = seed(dir, 'alive-docker', {
        pid: ALIVE_PID,
        startedIso: '2026-01-01T00:00:00.000Z',
        backend: 'docker',
      })
        .then(() =>
          appendSandboxEntry(dir, 'alive-docker', {
            kind: 'sandbox',
            backend: 'docker',
            name: 'rz-alive-1',
            id: 'alive-box',
          })
        )
      const seedMsb = seed(dir, 'dead-msb', { pid: 1, startedIso: '2026-01-01T00:00:00.000Z', backend: 'msb' })
        .then(() => appendSandboxEntry(dir, 'dead-msb', { kind: 'sandbox', backend: 'msb', name: 'rz-msb-1' }))
      const seedFresh = fsp
        .mkdir(join(dir, 'runs'), { recursive: true })
        .then(() => fsp.writeFile(join(dir, 'runs', 'fresh-garbage.json'), 'not-json', 'utf8'))
      return Promise.all([seedDead, seedAlive, seedMsb, seedFresh])
        .then(() =>
          Effect.runPromise(
            Effect.provide(reap({ runKill, timeSource }), backendLayerFor(dir)),
          )
        )
        .then(() => {
          // Stop+remove for the dead sandbox, remove-network for its network.
          const kills = killed.map((argv) => argv[argv.length - 1] ?? '')
          expect(kills).toEqual(['rz-dead-1', 'rz-dead-1', 'rz-net-dead'])
          // The kill argv never names anything outside the planted ledger.
          const prefixes = dockerKillCommands()
          expect(killed[0]?.slice(0, prefixes.stop.length)).toEqual(prefixes.stop)
          expect(killed[1]?.slice(0, prefixes.remove.length)).toEqual(prefixes.remove)
          expect(killed[2]?.slice(0, prefixes.removeNetwork.length)).toEqual(prefixes.removeNetwork)
          // The sweep NEVER touched the alive run, the msb run, or the fresh garbage.
          for (const argv of killed) {
            expect(argv.join(' ')).not.toContain('rz-alive-1')
            expect(argv.join(' ')).not.toContain('rz-msb-1')
            expect(argv.join(' ')).not.toContain('fresh-garbage')
          }
        })
        .then(() => {
          const runsDir = join(dir, 'runs')
          return Promise.all([
            fsp.access(join(runsDir, 'dead-docker.json')).then(
              () => Promise.reject(new Error('dead run record survived')),
              () => undefined, // access rejects on missing — the reaped run is correctly gone
            ),
            fsp.access(join(runsDir, 'alive-docker.json')),
            fsp.access(join(runsDir, 'dead-msb.json')),
            fsp.access(join(runsDir, 'fresh-garbage.json')),
          ]).then(
            () => undefined,
            (error: unknown) => Promise.reject(error),
          )
        })
        .then(() => {
          // Second pass: no dead runs remain — nothing more to kill.
          killed.length = 0
          return Effect.runPromise(Effect.provide(reap({ runKill, timeSource }), backendLayerFor(dir)))
        })
        .then(() => {
          expect(killed).toEqual([])
          return undefined
        })
    }))

  it('Should_ReapAStaleGarbageRecord_When_ItSurvivesTheFreshnessCutoff', () =>
    withTempDir((dir) => {
      const killed: Array<readonly string[]> = []
      // A fixed, far-future «now» and a 2001-era mtime make the age verdict
      // deterministic without any clock call: stale-by-a-century, reaped.
      const now = (): number => 1_800_000_000_000
      const stalePath = join(dir, 'runs', 'stale-garbage.json')
      const runsDir = join(dir, 'runs')
      return fsp
        .mkdir(runsDir, { recursive: true })
        .then(() => fsp.writeFile(stalePath, 'not-json', 'utf8'))
        .then(() => fsp.utimes(stalePath, 1_000_000_000, 1_000_000_000))
        .then(() =>
          Effect.runPromise(
            Effect.provide(reap({ runKill: (a) => killed.push([...a]), timeSource, now }), backendLayerFor(dir)),
          )
        )
        .then(() => {
          expect(killed).toHaveLength(0) // no entries — nothing to kill, only the deletion
          return fsp.access(stalePath).then(
            () => Promise.reject(new Error('stale garbage record survived the sweep')),
            () => undefined,
          )
        })
    }))
})

/** The scaffold layer every sweep test composes (selection + config). */
const backendLayerFor = (dir: string) =>
  Layer.mergeAll(
    Layer.succeed(Selection, { backend: 'docker', dockerSocketPath: undefined }),
    Layer.succeed(RightsizeConfig, {
      backend: 'auto',
      reaper: 'on',
      cacheDir: dir,
      reuse: false,
      msbPath: undefined,
      msbSkipDownload: false,
    }),
  )
