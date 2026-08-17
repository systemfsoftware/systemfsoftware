/**
 * The on-disk names-only ledger (R6) — the cross-process record of what
 * this process's run has created, and the orphan reaper over it.
 *
 * Layout under the rightsize cache dir:
 *
 * ```
 * <cacheDir>/runs/<runId>.json   — the run record: {pid, startedIso, backend}
 * <cacheDir>/runs/<runId>.jsonl  — JSON-lines entries, one per line:
 *     {"kind":"sandbox","backend":"docker","name":"rz-<runId>-<n>"}
 *     {"kind":"sandbox","backend":"docker","name":"rz-<runId>-<n>","id":"<backend id>"}
 *     {"kind":"network","id":"rz-net-<hex>"}
 * ```
 *
 * Legibility contract: the entry fields are names, backend names, and ids
 * ONLY — no absolute paths anywhere in a legible field (a later sweep must
 * not depend on this host's paths; the kill prefixes the sweep needs are
 * resolved by the sweeping process from its own config, never read back
 * from the ledger).
 *
 * Cross-process protocol:
 * - one process owns one run (RunId is per-process-lifetime unique), so two
 *   processes never write the same file; every write is atomic (tmp file +
 *   rename in the same directory), so a reader — another process's sweep,
 *   the watchdog after its owner died — never observes a torn file;
 * - within a process, every read-modify-write cycle runs through one
 *   process-wide promise chain, so concurrent launches serialize their
 *   appends/removes against each other without interleaving a line;
 * - the run record is written BEFORE the first entry, and a run's files are
 *   deleted once no entry remains (prune) or a sweep reaped the run (R6:
 *   "a later container start recreates them from scratch").
 *
 * The reap sweep (`sweepOnce`) reads every OTHER run's record + entries:
 * a run whose owner pid is gone (guarded by the same-pid start-time check)
 * and whose recorded backend matches this process's active backend is
 * reaped — every sandbox name killed through its stop/remove command
 * prefixes and every network id through the remove-network prefix — then
 * its run files are deleted. Killing is idempotent: a name the backend no
 * longer knows ("not found") is treated as success, and a failure reaping
 * one run never stops the sweep from considering the rest.
 *
 * This module is the library's one plain-persistence seam and deliberately
 * stays outside Effect-land (promise-chained, no `async` declarations —
 * this package's effect tsconfig profile bans them): the launch executor
 * wraps these calls in `Effect.tryPromise` and treats every ledger hiccup
 * as best-effort, on launch and on teardown alike. Keeping the clock and
 * the spawnSync edges here also keeps them out of Effect code.
 */
import { spawnSync } from 'node:child_process'
import type { SpawnSyncReturns } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { DOCKER_REAPER_KILL_COMMAND } from '../../backend-docker/cli.js'
import { writeFileAtomic } from '../../internal/atomic-write.js'
import type { BackendName } from '../../runtime/runtime.js'

// =============================================================================
// Layout (pure path derivation)
// =============================================================================

/** The directory holding every run's ledger files, under the cache dir. */
export const runsDir = (cacheDir: string): string => path.join(cacheDir, 'runs')

/** The run record file: `<cacheDir>/runs/<runId>.json`. */
export const runRecordPath = (cacheDir: string, runId: string): string => path.join(runsDir(cacheDir), `${runId}.json`)

/** The entries file: `<cacheDir>/runs/<runId>.jsonl`. */
export const runEntriesPath = (cacheDir: string, runId: string): string =>
  path.join(runsDir(cacheDir), `${runId}.jsonl`)

// =============================================================================
// Entry model — the legible, JSON-threadable ledger lines
// =============================================================================

/**
 * The only container name a ledger line may carry — `rz-<runId>-<seq>`
 * (launch.ts `finalizeAttemptSpec`, the run id being 8 lowercase hex and
 * the sequence a positive integer) or `rz-reuse-<hash12>` (reuse/hash.ts,
 * the deterministic adoption name). Foreign names must never reach a kill
 * command: a hostile or torn cache dir would otherwise turn the ledger's
 * write access into arbitrary container deletion through the reaper.
 */
export const SANDBOX_NAME_PATTERN = /^rz-(?:[0-9a-f]{8}-\d+|reuse-[0-9a-f]{12})$/

/** The only network identity a network line may carry — `rz-net-<8hex>`, the library-created network identity (model/network.ts). */
export const NETWORK_ID_PATTERN = /^rz-net-[0-9a-f]{8}$/

/** One tracked container: its backend, its run-scoped name (the kill key), and — once create succeeded — the backend-native id (the U8 by-id fingerprint). */
export interface SandboxLedgerEntry {
  readonly kind: 'sandbox'
  readonly backend: BackendName
  /** The run-scoped container name, `rz-<runId>-<seq>` — the only kill argument a sweep needs. */
  readonly name: string
  /** The backend-native container id, recorded after create succeeds. */
  readonly id?: string | undefined
}

/** One tracked library-created network. */
export interface NetworkLedgerEntry {
  readonly kind: 'network'
  readonly id: string
}

/** The closed entry union a run's `.jsonl` file may carry. */
export type LedgerEntry = SandboxLedgerEntry | NetworkLedgerEntry

/** A run record: the process-identity + backend a sweep needs to judge liveness. */
export interface RunRecord {
  /** The owning process's pid. */
  readonly pid: number
  /** The owning process's start time, ISO-8601 — the same-pid-reuse guard. */
  readonly startedIso: string
  /** The backend this run created on — a sweep only ever reaps runs on its own backend. */
  readonly backend: BackendName
}

/** Serializes an entry to its one JSON line. */
export const serializeLedgerEntry = (entry: LedgerEntry): string => JSON.stringify(entry)

/** Parses one ledger line; a malformed line yields `undefined` (a torn or foreign line is skipped, never trusted). */
export const parseLedgerEntry = (line: string): LedgerEntry | undefined => {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return undefined
  }
  if (value.kind === 'sandbox' && 'backend' in value && 'name' in value) {
    return parseSandboxLine(value)
  }
  if (value.kind === 'network' && 'id' in value) {
    return typeof value.id === 'string' && NETWORK_ID_PATTERN.test(value.id)
      ? { kind: 'network', id: value.id }
      : undefined
  }
  return undefined
}

/** Parses a sandbox line — `backend` + a grammar-proven `name`; the optional `id` is the recorded by-id fingerprint. */
const parseSandboxLine = (value: Record<'kind' | 'backend' | 'name', unknown>): SandboxLedgerEntry | undefined => {
  const { backend, name } = value
  if (
    (backend !== 'docker' && backend !== 'msb') ||
    typeof name !== 'string' ||
    !SANDBOX_NAME_PATTERN.test(name)
  ) {
    return undefined
  }
  if ('id' in value && typeof value.id === 'string' && value.id.length > 0) {
    return { kind: 'sandbox', backend, name, id: value.id }
  }
  return { kind: 'sandbox', backend, name }
}

// =============================================================================
// In-process write serialization — one lock chain, per-run ownership
// =============================================================================

let chain: Promise<void> = Promise.resolve()

/** Runs `fn` behind the process-wide chain: concurrent callers serialize, failures do not poison the chain. */
function withChain<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** A per-process counter for temp-file suffixes — pid + counter is unique enough without a clock. */
let tmpCounter = 0

const readText = (filePath: string): Promise<string> => fsp.readFile(filePath, 'utf8')

const readLines = (filePath: string): Promise<readonly string[]> =>
  readText(filePath).then(
    (text) => text.split('\n').filter((line) => line.length > 0),
    () => [],
  )

/**
 * Atomic replace: a missing entries file is an empty list (delete when
 * empty, tmp+rename otherwise) — a lock-free cross-process reader of a
 * DIFFERENT run's file is only ever present after that run's owner is dead,
 * so it sees either the old or the new complete file, never a torn one.
 */
const writeLinesAtomic = (filePath: string, lines: ReadonlyArray<string>): Promise<void> => {
  if (lines.length === 0) {
    return fsp.unlink(filePath).catch(() => undefined)
  }
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${tmpCounter++}.tmp`)
  return fsp.writeFile(tmp, `${lines.join('\n')}\n`).then(
    () => fsp.rename(tmp, filePath),
    (error: unknown) => {
      fsp.unlink(tmp).catch(() => {})
      throw error
    },
  )
}

const removeFirstOccurrence = (lines: ReadonlyArray<string>, value: string): ReadonlyArray<string> => {
  const index = lines.indexOf(value)
  if (index === -1) {
    return lines
  }
  return [...lines.slice(0, index), ...lines.slice(index + 1)]
}

// =============================================================================
// Persistence — plain promise-chained atomic read-modify-write cycles
// =============================================================================

/**
 * Writes this run's record atomically — called once, before the first
 * entry of the run is appended (the superset invariant depends on this
 * ordering). Rejects on failure; callers decide whether a ledger hiccup is
 * launch-fatal (it is never teardown-fatal).
 */
export const writeRunRecord = (cacheDir: string, runId: string, record: RunRecord): Promise<void> => {
  const dir = runsDir(cacheDir)
  const target = runRecordPath(cacheDir, runId)
  const tmp = `.${runId}.json.${process.pid}.${tmpCounter++}.tmp`
  return withChain(() => writeFileAtomic(dir, target, tmp, record))
}

/** Reads a run's record file raw + its mtime — `undefined` when the file is gone (a clean shutdown or a concurrent sweep already reaped it). */
export const readRunRecordRaw = (
  cacheDir: string,
  runId: string,
): Promise<{ text: string; mtimeMs: number } | undefined> => {
  const filePath = runRecordPath(cacheDir, runId)
  return Promise.all([readText(filePath), fsp.stat(filePath)]).then(
    ([text, stat]) => ({ text, mtimeMs: stat.mtimeMs }),
    () => undefined,
  )
}

/** Parses a run record body — `undefined` when it is not a well-formed record. */
export const parseRunRecord = (text: string): RunRecord | undefined => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  if (!('pid' in value) || !('startedIso' in value) || !('backend' in value)) {
    return undefined
  }
  const { pid, startedIso, backend } = value
  if (typeof pid !== 'number' || !Number.isInteger(pid) || typeof startedIso !== 'string') {
    return undefined
  }
  if (backend !== 'docker' && backend !== 'msb') {
    return undefined
  }
  return { pid, startedIso, backend }
}

/** Every run id with a record file currently under `runs/` — the sweep's iteration set. */
export const listRunIds = (cacheDir: string): Promise<readonly string[]> =>
  fsp.readdir(runsDir(cacheDir)).then(
    (entries) => entries.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)),
    () => [],
  )

/** The run's current entries, in order; a missing/malformed file reads as an empty list. */
export const readLedgerEntries = (cacheDir: string, runId: string): Promise<readonly LedgerEntry[]> =>
  withChain(() => readLines(runEntriesPath(cacheDir, runId))).then((lines) => {
    const entries: LedgerEntry[] = []
    for (const line of lines) {
      const parsed = parseLedgerEntry(line)
      if (parsed !== undefined) {
        entries.push(parsed)
      }
    }
    return entries
  })

/** Appends a sandbox entry BEFORE the backend's create() — the ledger is always a superset of live sandboxes, never a subset. */
export const appendSandboxEntry = (cacheDir: string, runId: string, entry: SandboxLedgerEntry): Promise<void> =>
  withChain(() => {
    const filePath = runEntriesPath(cacheDir, runId)
    return fsp
      .mkdir(runsDir(cacheDir), { recursive: true })
      .then(() => readLines(filePath))
      .then((lines) => writeLinesAtomic(filePath, [...lines, JSON.stringify(entry)]))
  })

/** Records the backend-native id on an already-tracked sandbox's line, once create succeeded (the U8 by-id fingerprint). */
export const recordSandboxId = (cacheDir: string, runId: string, name: string, id: string): Promise<void> =>
  withChain(() => {
    const filePath = runEntriesPath(cacheDir, runId)
    return readLines(filePath).then((lines) => {
      const updated = lines.map((line) => {
        const parsed = parseLedgerEntry(line)
        if (parsed !== undefined && parsed.kind === 'sandbox' && parsed.name === name) {
          return JSON.stringify({ ...parsed, id })
        }
        return line
      })
      return writeLinesAtomic(filePath, updated)
    })
  })

/** Writes the remaining lines, then prunes the run's files when nothing is left tracked. */
const pruneOrWrite = (cacheDir: string, runId: string, filePath: string, lines: ReadonlyArray<string>): Promise<void> =>
  // `lines.length === 0` is exactly "nothing left tracked" — nothing else can
  // be in the file, so there is no need to re-read it. Re-entering withChain
  // from inside a chained step would wait on the very chain this step runs
  // on and deadlock (the chain serializes reads AND writes of this file).
  lines.length === 0 ? deleteRunFiles(cacheDir, runId) : writeLinesAtomic(filePath, lines)

/** Removes a sandbox's line — called AFTER its stop/remove; prunes the run's files when nothing is left tracked. */
export const removeSandboxEntry = (cacheDir: string, runId: string, name: string): Promise<void> =>
  withChain(() => {
    const filePath = runEntriesPath(cacheDir, runId)
    return readLines(filePath).then((lines) => {
      const remaining = lines.filter((line) => {
        const parsed = parseLedgerEntry(line)
        return !(parsed !== undefined && parsed.kind === 'sandbox' && parsed.name === name)
      })
      return pruneOrWrite(cacheDir, runId, filePath, remaining)
    })
  })

/** Appends a network id to the run's entries — same protocol as the sandbox append, after `ensureNetwork`. */
export const appendNetworkEntry = (cacheDir: string, runId: string, id: string): Promise<void> =>
  withChain(() => {
    const filePath = runEntriesPath(cacheDir, runId)
    return fsp
      .mkdir(runsDir(cacheDir), { recursive: true })
      .then(() => readLines(filePath))
      .then((lines) => writeLinesAtomic(filePath, [...lines, JSON.stringify({ kind: 'network', id })]))
  })

/** Removes a network's line, then prunes the run's files when nothing is left tracked. */
export const removeNetworkEntry = (cacheDir: string, runId: string, id: string): Promise<void> =>
  withChain(() => {
    const filePath = runEntriesPath(cacheDir, runId)
    const marker = JSON.stringify({ kind: 'network', id })
    return readLines(filePath).then((lines) =>
      pruneOrWrite(cacheDir, runId, filePath, removeFirstOccurrence(lines, marker))
    )
  })

/** Best-effort delete of a run's ledger files; a file already gone is not an error. */
export const deleteRunFiles = (cacheDir: string, runId: string): Promise<void> => {
  const [recordPathValue, entriesPathValue] = [runRecordPath(cacheDir, runId), runEntriesPath(cacheDir, runId)]
  return Promise.all([fsp.unlink(recordPathValue).catch(() => {}), fsp.unlink(entriesPathValue).catch(() => {})]).then(
    () => undefined,
  )
}

// =============================================================================
// Kill commands — per-backend reaper prefixes (R6)
// =============================================================================

/** The argv prefixes the reaper and watchdog append a name/id to (the argument comes last). */
export interface ReaperKillCommands {
  readonly backend: BackendName
  /** The stop prefix — empty where the backend has no separate stop step (docker's `rm -f` does both). */
  readonly stop: ReadonlyArray<string>
  /** The remove prefix — `docker rm -f` / `msb rm`. */
  readonly remove: ReadonlyArray<string>
  /** The network-remove prefix — empty where the backend has no native network object (msb). */
  readonly removeNetwork: ReadonlyArray<string>
}

/** The docker kill commands (the static `DOCKER_REAPER_KILL_COMMAND` surface, backend-tagged). */
export const dockerKillCommands = (): ReaperKillCommands => ({
  backend: 'docker',
  stop: DOCKER_REAPER_KILL_COMMAND.stop,
  remove: DOCKER_REAPER_KILL_COMMAND.remove,
  removeNetwork: DOCKER_REAPER_KILL_COMMAND.removeNetwork,
})

/** The msb kill commands over the resolved binary path — the argv shape `registerMsbCleanupSync` uses (`msb stop <name>`, `msb rm <name>`). */
export const msbKillCommands = (msbPath: string): ReaperKillCommands => ({
  backend: 'msb',
  stop: [msbPath, 'stop'],
  remove: [msbPath, 'rm'],
  removeNetwork: [],
})

/** The default kill runner: one blocking spawnSync per prefix+arg, exit code ignored, never throws. */
export const spawnSyncKill = (argv: ReadonlyArray<string>): void => {
  const command = argv[0]
  if (command === undefined) {
    return
  }
  try {
    spawnSync(command, argv.slice(1), { stdio: ['ignore', 'ignore', 'ignore'] as const })
  } catch {
    // Best-effort — "not found" and any other failure read as done.
  }
}

// =============================================================================
// Cross-process liveness — same-pid + start-time guard
// =============================================================================

/** The two operations a sweep needs about any pid on this machine, abstracted so tests fabricate arbitrary (pid, start-time) pairs. */
export interface ProcessTimeSource {
  /** Whether a process with this pid currently exists. */
  readonly isAlive: (pid: number) => boolean
  /** That process's start time, ISO-8601, or `undefined` when undeterminable. */
  readonly startedIso: (pid: number) => Promise<string | undefined>
}

/** `process.kill(pid, 0)`: existence-check only; EPERM means "exists but not ours" — still alive. */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM'
  }
}

/** The same-pid-reuse tolerance — a run is alive iff its pid exists AND its actual start time matches the recorded one within this window. */
export const LIVENESS_TOLERANCE_MS = 2_000

/**
 * Judges a recorded (pid, startedIso) against a time source. The verdict is
 * conservative — cleanup-biased only on PROOF: a pid that provably does not
 * exist (or provably started at another instant) is dead; an
 * undeterminable start time must be read as «cannot confirm» and skipped,
 * because a failed or mid-flight probe is never evidence to rm -f another
 * run's containers.
 */
export const isRecordAlive = (source: ProcessTimeSource, pid: number, recordedStartedIso: string): Promise<boolean> => {
  if (!source.isAlive(pid)) {
    return Promise.resolve(false) // the pid itself is gone — a confirmed death
  }
  return source.startedIso(pid).then((actual) => {
    if (actual === undefined) {
      // Undeterminable: without a start-time answer there is no way to tell
      // a dead owner from a probe failure or an unreadable /proc — a wrong
      // kill is worse than a leaked run, so this pass leaves it alone.
      return true
    }
    const diff = Math.abs(Date.parse(actual) - Date.parse(recordedStartedIso))
    return Number.isFinite(diff) && diff <= LIVENESS_TOLERANCE_MS
  })
}

/** This process's own start time, computed once at module load from `process.uptime()` (Node has no direct process-start instant). */
// This is a module-load snapshot, never a live clock read — the one place
// a plain Date is the only honest primitive (there is no Effect at module
// scope here). @effect-diagnostics-next-line globalDate:off
export const THIS_PROCESS_STARTED_ISO: string = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString()

/** The stdout of a `spawnSync` result as text — spawnSync types stdout as `string | Buffer` regardless of the `encoding` option. */
const syncText = (result: SpawnSyncReturns<string | Buffer>): string => {
  if (typeof result.stdout === 'string') {
    return result.stdout
  }
  return result.stdout !== null ? result.stdout.toString('utf8') : ''
}

/** `[[dd-]hh:]mm:ss` → milliseconds; undefined for an unparseable duration. */
export const parseEtimeMs = (text: string): number | undefined => {
  const match = /^(?:(\d+)-)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (match === null) {
    return undefined
  }
  const [, days, hours, minutes, seconds] = match
  const totalSeconds = (Number(days ?? 0) * 24 * 60 + Number(hours ?? 0) * 60 + Number(minutes ?? 0)) * 60 +
    Number(seconds ?? 0)
  return Number.isFinite(totalSeconds) ? totalSeconds * 1000 : undefined
}

/** One synchronous spawnSync probe returning (status, stdout) — the process-liveness edge. */
const runProbe = (command: string, args: ReadonlyArray<string>): SpawnSyncReturns<string | Buffer> =>
  spawnSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] as const })

/**
 * The real, OS-backed time source. POSIX: `ps -p <pid> -o etime=` — a
 * DURATION, not a wall-clock stamp, so there is no timezone to get wrong
 * (upstream's empirically-checked choice). Windows: PowerShell's
 * `StartTime` converted to UTC ISO-8601.
 */
export const realProcessTimeSource: ProcessTimeSource = {
  isAlive: isProcessAlive,
  startedIso: (pid: number): Promise<string | undefined> => {
    if (process.platform === 'win32') {
      const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
        `if ($p) { $p.StartTime.ToUniversalTime().ToString('o') }`
      const result = runProbe('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
      const trimmed = syncText(result).trim()
      if (trimmed.length === 0) {
        return Promise.resolve(undefined)
      }
      // The Windows liveness probe parses PowerShell's own ISO timestamp —
      // a wire value, not a clock read. @effect-diagnostics-next-line globalDate:off
      const parsed = new Date(trimmed)
      return Promise.resolve(Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString())
    }
    const result = runProbe('ps', ['-p', String(pid), '-o', 'etime='])
    if (result.status !== 0) {
      return Promise.resolve(undefined)
    }
    const durationMs = parseEtimeMs(syncText(result))
    // etime is a duration; "now minus duration" is the process's start
    // instant — computed once per probe, the pinned tolerance absorbs the
    // skew. @effect-diagnostics-next-line globalDate:off
    return Promise.resolve(durationMs === undefined ? undefined : new Date(Date.now() - durationMs).toISOString())
  },
}

// =============================================================================
// The sweep — one idempotent reaping pass over every other run
// =============================================================================

/** An unparseable record younger than this is presumed mid-write by its owning process, not genuinely corrupt. */
export const UNPARSEABLE_FRESH_AGE_MS = 60 * 60 * 1_000

/** The module-load snapshot of «now» — the sweep's default clock, captured once so no live `Date.now()` call sits in a sweep path. */
const sweepClock: () => number = Date.now

/** What one sweep pass needs: where the ledger lives, which run to exempt, and how to actually remove things by name/id (module seam, never a published projection). */
interface SweepDeps {
  readonly cacheDir: string
  /** This process's own run id — always skipped. */
  readonly thisRunId: string
  /** The kill commands for THIS process's active backend (mismatched-backend runs are left alone). */
  readonly kill: ReaperKillCommands
  /** The command runner seam; defaults to `spawnSyncKill`. */
  readonly runKill?: ((argv: ReadonlyArray<string>) => void) | undefined
  /** The liveness source; defaults to `realProcessTimeSource`. */
  readonly timeSource?: ProcessTimeSource | undefined
  /** The «now» clock for the unparseable-age rule; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined
}

/**
 * One run's reap, two-phase: phase 1 stops+removes every sandbox (in ledger
 * order), phase 2 removes every network, then the run's files are deleted.
 * The ledger's network row precedes its sandbox rows (the network is
 * ensured before the create/start loop), so a single in-order pass would
 * `docker network rm` while members still exist and leak the network
 * forever — every member must be detached before any network removal.
 */
const reapRun = (deps: SweepDeps, runId: string): Promise<void> =>
  readLedgerEntries(deps.cacheDir, runId).then((entries) => {
    const runKill = deps.runKill ?? spawnSyncKill
    // Phase 1: every sandbox — detach the whole member set first.
    for (const entry of entries) {
      if (entry.kind === 'sandbox') {
        runKill([...deps.kill.stop, entry.name])
        runKill([...deps.kill.remove, entry.name])
      }
    }
    // Phase 2: every network — with all members reaped, `docker network rm`
    // succeeds on the first attempt.
    for (const entry of entries) {
      if (entry.kind === 'network') {
        runKill([...deps.kill.removeNetwork, entry.id])
      }
    }
    return deleteRunFiles(deps.cacheDir, runId)
  })

/**
 * Judges one run record and reaps the run when it is dead on this backend.
 * Never rejects: a failure reaping a single run must not stop the sweep
 * from considering the rest (and a racing sweep has already done the work).
 */
const sweepOneRun = (deps: SweepDeps, runId: string): Promise<void> =>
  readRunRecordRaw(deps.cacheDir, runId).then((record) => {
    if (record === undefined) {
      return undefined // vanished mid-scan: clean shutdown or another sweep won the race
    }
    const parsed = parseRunRecord(record.text)
    if (parsed === undefined) {
      const ageMs = (deps.now ?? sweepClock)() - record.mtimeMs
      return ageMs > UNPARSEABLE_FRESH_AGE_MS ? reapRun(deps, runId) : undefined
    }
    if (parsed.backend !== deps.kill.backend) {
      return undefined // a docker process cannot remove msb sandboxes and vice versa
    }
    return isRecordAlive(deps.timeSource ?? realProcessTimeSource, parsed.pid, parsed.startedIso).then((alive) =>
      alive ? undefined : reapRun(deps, runId)
    )
  })

/**
 * One full sweep pass: every run other than this process's own is
 * inspected once. Dead runs on this backend are reaped; alive runs, this
 * run, and other-backend runs are left untouched. Idempotent: a second
 * pass counts a reaped run's vanished files as done. Never throws.
 */
export const sweepOnce = (deps: SweepDeps): Promise<void> =>
  listRunIds(deps.cacheDir).then((runIds) => {
    const targets = runIds.filter((runId) => runId !== deps.thisRunId)
    return Promise.all(targets.map((runId) => sweepOneRun(deps, runId).catch(() => undefined))).then(() => undefined)
  })
