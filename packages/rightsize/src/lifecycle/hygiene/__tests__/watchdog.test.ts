/**
 * Watchdog contracts (R6) — script integrity, argv, and the detached
 * script's own behavior:
 *
 * - a cached watchdog whose bytes no longer match its content-addressed
 *   name is refused before spawn (no attacker code, ever, at process
 *   death) and the watchdog init is skipped;
 * - the spawned argv carries the owner pid AND the recorded start instant
 *   (the same-pid-reuse guard's recorded half);
 * - `trackSandboxLedger` resolves only after the ledger append is durable
 *   (the launch awaits it before the backend create — the superset
 *   invariant, so a crash between the two can never strand a container);
 * - the executed script kills every sandbox before any network and skips a
 *   torn/foreign line;
 * - the executed script's liveness is /proc start-time comparison: a live
 *   matching owner and an unreadable start time both skip the reap
 *   (conservative), while a live owner whose recorded start time differs —
 *   the reused-pid wedge — is reaped.
 *
 * No `async` anywhere (the effect language-service plugin's
 * `effect(asyncFunction)` rule): effects are run through `Effect.runPromise`,
 * and the script-execution harness is synchronous (spawnSync + node:fs).
 */
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { DateTime, Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { RunId } from '../../../runtime/run-id.js'
import { dockerKillCommands, readLedgerEntries, runEntriesPath, runRecordPath, runsDir } from '../ledger.js'
import {
  _resetReaperForTests,
  ensureReaperInitialized,
  spawnWatchdog,
  trackSandboxLedger,
  type WatchdogArgs,
  watchdogDir,
  watchdogScriptContent,
  watchdogScriptFilename,
} from '../watchdog.js'

const tmpDirs: string[] = []
const ownerChildren: Array<ReturnType<typeof spawn>> = []

const makeCacheDir = (): Promise<string> => {
  const dir = fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-watchdog-'))
  tmpDirs.push(path.join(os.tmpdir(), 'rightsize-watchdog-'))
  return dir
}

afterEach(() => {
  for (const child of ownerChildren.splice(0)) {
    child.kill('SIGKILL')
  }
  _resetReaperForTests()
  return Promise.all(tmpDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })))
})

const makeArgs = (cacheDir: string, overrides: Partial<WatchdogArgs> = {}): WatchdogArgs => ({
  cacheDir,
  runId: '0123abcd',
  ownerPid: process.pid,
  ownerStartedIso: '1970-01-01T00:00:00.000Z',
  kill: dockerKillCommands(),
  ...overrides,
})

// =============================================================================
// Spawn-side contracts
// =============================================================================

describe('watchdog spawn', () => {
  it('Should_RefuseSpawn_When_ScriptBytesNoLongerMatchTheContentAddressedName', () =>
    makeCacheDir().then((cacheDir) => {
      const content = watchdogScriptContent()
      const scriptPath = path.join(watchdogDir(cacheDir), watchdogScriptFilename(content))
      return fs.promises
        .mkdir(path.dirname(scriptPath), { recursive: true })
        .then(() =>
          // A replaced script: same filename, attacker bytes. The access()
          // check alone would pass it — the re-read must not.
          fs.promises.writeFile(scriptPath, 'console.log("pwned")')
        )
        .then(() => {
          let spawns = 0
          return Effect.runPromise(
            spawnWatchdog(makeArgs(cacheDir), {
              spawnChild: () => {
                spawns += 1
                return { close: () => {} }
              },
            }),
          ).then((handle) => {
            expect(handle).toBeUndefined()
            expect(spawns).toBe(0)
          })
        })
    }))

  it('Should_SpawnWithTheOwnerPidAndStartInstant_When_ScriptIsUntouched', () =>
    makeCacheDir().then((cacheDir) => {
      const startedIso = '2026-08-17T00:00:00.000Z'
      return Effect.runPromise(
        Effect.gen(function*() {
          let seen: ReadonlyArray<string> | undefined
          const spawned = yield* spawnWatchdog(makeArgs(cacheDir, { ownerStartedIso: startedIso }), {
            spawnChild: (_command, childArgv) => {
              seen = childArgv
              return { close: () => {} }
            },
          })
          return { handle: spawned, argv: seen }
        }),
      ).then(({ handle, argv }) => {
        expect(handle).toBeDefined()
        const captured = argv ?? []
        // The seam receives [scriptPath, ...watchdogArgs] — the pid and the
        // start instant are the two trailing argv entries.
        expect(captured[captured.length - 2]).toBe(String(process.pid))
        expect(captured[captured.length - 1]).toBe(startedIso)
      })
    }))

  it('Should_AwaitTheLedgerAppend_When_TrackingASandbox', () => {
    _resetReaperForTests()
    return makeCacheDir().then((cacheDir) =>
      Effect.runPromise(
        Effect.gen(function*() {
          yield* ensureReaperInitialized({
            cacheDir,
            backend: 'docker',
            kill: dockerKillCommands(),
            mode: 'on',
            spawnChild: () => ({ close: () => {} }),
          })
          const ok = yield* trackSandboxLedger({
            kind: 'sandbox',
            backend: 'docker',
            name: 'rz-0123abcd-1',
          })
          const entries = yield* Effect.promise(() => readLedgerEntries(cacheDir, RunId.value))
          return { ok, entries }
        }),
      ).then(({ ok, entries }) => {
        // The effect's resolution IS the append's durability: when it
        // returns true the line is already on disk (a fire-and-forget
        // append would hand back `true` before any write happened, and a
        // crash right after create would strand the container).
        expect(ok).toBe(true)
        expect(entries.some((entry) => entry.kind === 'sandbox' && entry.name === 'rz-0123abcd-1')).toBe(true)
      })
    )
  })
})

// =============================================================================
// The executed script (POSIX /proc liveness; exercised on Linux only)
// =============================================================================

const recorderContent = 'const fs = require("fs");\n' +
  'fs.appendFileSync(process.argv[2], process.argv.slice(3).join(" ") + "\\n");\n'

const startOwner = (): ReturnType<typeof spawn> => {
  const child = spawn(process.execPath, ['-e', 'setInterval(function () {}, 1000)'])
  ownerChildren.push(child)
  return child
}

/** The owner's start instant from /proc — computed the same way the script computes it. */
const ownerStartSeconds = (pid: number): number | undefined => {
  let stat: string
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
  } catch {
    return undefined
  }
  const close = stat.lastIndexOf(')')
  if (close < 0) {
    return undefined
  }
  const fields = stat.slice(close + 1).trim().split(/\s+/)
  const ticks = Number(fields[19])
  let boot = ''
  try {
    boot = fs.readFileSync('/proc/stat', 'utf8')
  } catch {
    return undefined
  }
  const btimeLine = boot.split('\n').find((line) => line.startsWith('btime '))
  if (btimeLine === undefined) {
    return undefined
  }
  const btime = Number(btimeLine.slice('btime '.length).trim())
  return Number.isFinite(ticks) && Number.isFinite(btime) ? btime + ticks / 100 : undefined
}

/** Executes the generated watchdog script against a temp ledger + recorder command. */
const invokeWatchdog = (opts: {
  readonly cacheDir: string
  readonly entriesLines: readonly string[]
  readonly recorder: string
  readonly logPath: string
  readonly ownerPid: number
  readonly ownerStartedIso: string
  readonly timeoutMs?: number
}): { readonly result: SpawnSyncReturns<string>; readonly entriesPath: string; readonly recordPath: string } => {
  const content = watchdogScriptContent()
  const scriptPath = path.join(opts.cacheDir, 'watchdog-exec.js')
  const entriesPath = runEntriesPath(opts.cacheDir, '0123abcd')
  const recordFilePath = runRecordPath(opts.cacheDir, '0123abcd')
  fs.mkdirSync(runsDir(opts.cacheDir), { recursive: true })
  fs.writeFileSync(entriesPath, `${opts.entriesLines.join('\n')}\n`)
  fs.writeFileSync(recordFilePath, '{}')
  fs.writeFileSync(scriptPath, content)
  const stopCmd = `node ${opts.recorder} ${opts.logPath} stop`
  const removeCmd = `node ${opts.recorder} ${opts.logPath} remove`
  const removeNetCmd = `node ${opts.recorder} ${opts.logPath} net`
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      entriesPath,
      entriesPath,
      recordFilePath,
      stopCmd,
      removeCmd,
      removeNetCmd,
      String(opts.ownerPid),
      opts.ownerStartedIso,
    ],
    { encoding: 'utf8', timeout: opts.timeoutMs ?? 2_000 },
  )
  return { result, entriesPath, recordPath: recordFilePath }
}

const readLinesIfExists = (logPath: string): readonly string[] =>
  fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter((line) => line.length > 0) : []

/** A fixed exec harness dir, cleaned by afterEach like the temp dirs. */
const execCacheDir = (suffix: string): string => {
  const dir = path.join(os.tmpdir(), `rightsize-watchdog-exec-${suffix}`)
  tmpDirs.push(dir)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const linuxScriptHarnessRun = process.platform !== 'linux'

describe.skipIf(linuxScriptHarnessRun)('the executed watchdog script', () => {
  it('Should_ReapSandboxesBeforeNetworks_When_TheRecordedOwnerStartDiffers', () => {
    const cacheDir = execCacheDir('1')
    const recorder = path.join(cacheDir, 'recorder.js')
    const logPath = path.join(cacheDir, 'kills.log')
    fs.writeFileSync(recorder, recorderContent)

    // The owner is a LIVE child whose recorded (wrong) start instant proves
    // its pid was reused — the old process.kill(pid, 0) liveness would have
    // wedged cleanup here forever.
    const owner = startOwner()
    if (owner.pid === undefined) {
      throw new Error('owner child failed to spawn')
    }

    // The ledger order: the network row precedes the sandbox rows, plus a
    // foreign sandbox line that must never be killed.
    const entriesLines = [
      JSON.stringify({ kind: 'network', id: 'rz-net-fedc1234' }),
      JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-7' }),
      JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'victim-9' }),
    ]

    const { result, entriesPath, recordPath } = invokeWatchdog({
      cacheDir,
      entriesLines,
      recorder,
      logPath,
      ownerPid: owner.pid,
      ownerStartedIso: '1970-01-01T00:00:00.000Z',
    })

    expect(result.status).toBe(0)

    const lines = readLinesIfExists(logPath)
    const stopIndex = lines.findIndex((line) => line === 'stop rz-0123abcd-7')
    const removeIndex = lines.findIndex((line) => line === 'remove rz-0123abcd-7')
    const netIndex = lines.findIndex((line) => line === 'net rz-net-fedc1234')
    expect(stopIndex).toBeGreaterThanOrEqual(0)
    expect(removeIndex).toBeGreaterThanOrEqual(0)
    expect(netIndex).toBeGreaterThanOrEqual(0)
    // Two-phase: the member is fully detached before the network is removed.
    expect(removeIndex).toBeLessThan(netIndex)
    // The hostile line never reached a kill command.
    expect(lines).not.toContain('stop victim-9')
    expect(lines).not.toContain('remove victim-9')
    // The reaped run's ledger artifacts are gone.
    expect(fs.existsSync(entriesPath)).toBe(false)
    expect(fs.existsSync(recordPath)).toBe(false)
  })

  it('Should_SkipTheReap_When_TheLiveOwnerStartMatches', () => {
    const cache = execCacheDir('2')
    const recorder = path.join(cache, 'recorder.js')
    const logPath = path.join(cache, 'kills.log')
    fs.writeFileSync(recorder, recorderContent)

    const owner = startOwner()
    if (owner.pid === undefined) {
      throw new Error('owner child failed to spawn')
    }
    const startSeconds = ownerStartSeconds(owner.pid)
    if (startSeconds === undefined) {
      throw new Error('cannot read the owner start time')
    }
    const startedIso = String(DateTime.fromEpochSeconds(startSeconds).toJSON())

    const { result, entriesPath } = invokeWatchdog({
      cacheDir: cache,
      entriesLines: [JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-7' })],
      recorder,
      logPath,
      ownerPid: owner.pid,
      ownerStartedIso: startedIso,
      timeoutMs: 1_200,
    })

    // The owner is alive: the script keeps polling and is killed by the
    // harness timeout, reaping nothing.
    expect(result.status).toBeNull()
    expect(readLinesIfExists(logPath)).toEqual([])
    expect(fs.existsSync(entriesPath)).toBe(true)
  })

  it('Should_SkipTheReap_When_StartTimeIsUnreadable', () => {
    const cache = execCacheDir('3')
    const recorder = path.join(cache, 'recorder.js')
    const logPath = path.join(cache, 'kills.log')
    fs.writeFileSync(recorder, recorderContent)

    // pid -1 has no /proc entry: the start time is unreadable, so the
    // verdict is «unknown» and the conservative script must NOT reap.
    const { result, entriesPath } = invokeWatchdog({
      cacheDir: cache,
      entriesLines: [JSON.stringify({ kind: 'sandbox', backend: 'docker', name: 'rz-0123abcd-7' })],
      recorder,
      logPath,
      ownerPid: -1,
      ownerStartedIso: '1970-01-01T00:00:00.000Z',
      timeoutMs: 1_200,
    })

    expect(result.status).toBeNull()
    expect(readLinesIfExists(logPath)).toEqual([])
    expect(fs.existsSync(entriesPath)).toBe(true)
  })
})
