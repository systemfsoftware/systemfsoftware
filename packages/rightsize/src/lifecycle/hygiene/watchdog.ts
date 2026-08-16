/**
 * The reaper bring-up and the detached watchdog (R6) — the SIGKILL-safe
 * sweep.
 *
 * `ensureReaperInitialized` is the one bring-up gate the launch executor
 * calls before its first backend create. It reads `RIGHTSIZE_REAPER` and
 * acts per mode:
 *
 * - `on` (default) — write this run's ledger record, sweep every OTHER dead
 *   run on this backend (the startup sweep that clears a crashed prior
 *   run's leftovers), then spawn a DETACHED watchdog child that reaps THIS
 *   run's ledger entries the instant this process dies — cleanly or via
 *   SIGKILL, where no exit handler can ever run;
 * - `sweep` — the one-shot startup sweep only; no watchdog (a caller owns
 *   the run explicitly, or the platform is known to tear down children);
 * - `off` — nothing: no record, no ledger tracking, no sweep, no watchdog.
 *
 * The ledger *tracking* surface (`trackSandboxLedger` / `trackNetworkLedger`
 * / the untrack twins) is a no-op unless a run is active, so a process that
 * never initialized — or initialized to `off` — skips every ledger write
 * without the callers branching on the mode.
 *
 * The watchdog is a content-addressed Node script (`watchdog-<sha256-12>.js`
 * under `<cacheDir>/reaper/`, named by its own bytes so a write can never
 * clobber a script another contract runs). It polls the owner pid every
 * 500ms (`process.kill(pid, 0)` — the same liveness primitive the sweep
 * uses), and once the owner is gone reaps every sandbox/network the run's
 * ledger lines name through the kill command prefixes and deletes the run's
 * ledger files. It is spawned `detached: true` + `unref()`ed — the whole
 * point is surviving the owner's SIGKILL.
 *
 * Every failure here is best-effort end to end: a broken cache dir or a
 * sweep hiccup never prevents the backend from being usable — the ledger
 * simply stays inactive (or partially active) and the reaper is the safety
 * net that recomputes everything from disk on the next launch.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { Effect } from 'effect'

import type { ReaperMode } from '../../runtime/config.js'
import { RunId } from '../../runtime/run-id.js'
import type { BackendName } from '../../runtime/runtime.js'
import {
  appendNetworkEntry,
  appendSandboxEntry,
  type ProcessTimeSource,
  type ReaperKillCommands,
  recordSandboxId,
  removeNetworkEntry,
  removeSandboxEntry,
  runEntriesPath,
  runRecordPath,
  sweepOnce,
  THIS_PROCESS_STARTED_ISO,
  writeRunRecord,
} from './ledger.js'

// =============================================================================
// The watchdog script — a detached Node child, content-addressed
// =============================================================================

/** The watchdog's argv: the run's three ledger paths, the three kill prefixes, and the owner pid. */
export interface WatchdogArgs {
  readonly cacheDir: string
  readonly runId: string
  readonly ownerPid: number
  readonly kill: ReaperKillCommands
}

const joinPrefix = (argv: ReadonlyArray<string>): string => argv.join(' ')

/**
 * The script body. argv: `<sandboxesPath> <networksPath> <recordPath>
 * <stopCmd> <removeCmd> <removeNetCmd> <ownerPid>`; each *Cmd is a single
 * space-joined argv prefix (may be empty); the reaped name is appended as
 * the final argument. The ledger is JSON-lines, so each line is parsed (a
 * torn line is skipped) and sandbox names / network ids are reaped.
 * Deterministic — never hand-edited; a unit test can execute it against a
 * stub recorder command without touching the real backends.
 */
export const watchdogScriptContent = (): string =>
  `// rightsize reaper watchdog — generated file, named by its own content hash.
// argv: <sandboxesPath> <networksPath> <recordPath> <stopCmd> <removeCmd> <removeNetCmd> <ownerPid>
"use strict";
const fs = require("fs");
const { spawnSync } = require("node:child_process");

const [sandboxesPath, networksPath, recordPath, stopCmd, removeCmd, removeNetCmd, ownerPidRaw] = process.argv.slice(2);
const ownerPid = Number(ownerPidRaw);

function ownerAlive() {
  try {
    process.kill(ownerPid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

function splitCmd(cmd) {
  return cmd.length === 0 ? [] : cmd.split(" ");
}

function runCmd(prefix, name) {
  const words = splitCmd(prefix);
  if (words.length === 0) return;
  try {
    spawnSync(words[0], words.slice(1).concat(name), { stdio: "ignore" });
  } catch {
    // best-effort: "not found" and any other failure read as done
  }
}

function reapLines(filePath, stopPrefix, removePrefix, removeNetPrefix) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\\n");
  for (const line of lines) {
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // torn or foreign line — never trusted
    }
    if (entry && entry.kind === "sandbox" && typeof entry.name === "string") {
      runCmd(stopPrefix, entry.name);
      runCmd(removePrefix, entry.name);
    } else if (entry && entry.kind === "network" && typeof entry.id === "string") {
      runCmd(removeNetPrefix, entry.id);
    }
  }
}

function reap() {
  reapLines(sandboxesPath, stopCmd, removeCmd, removeNetCmd);
  for (const filePath of [sandboxesPath, networksPath, recordPath]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // already gone — fine
    }
  }
}

// Block until the owner is gone — cleanly or via SIGKILL; polling every
// 500ms, the same liveness primitive the sweep uses.
function poll() {
  if (ownerAlive()) {
    setTimeout(poll, 500);
    return;
  }
  reap();
}

poll();
`

/** `watchdog-<12 hex of SHA-256(content)>.js` — the filename derives from the script's own bytes. */
export const watchdogScriptFilename = (content: string): string => {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12)
  return `watchdog-${hash}.js`
}

/** The directory the watchdog script lives in, under the cache dir (shared by every version of the package). */
export const watchdogDir = (cacheDir: string): string => path.join(cacheDir, 'reaper')

/**
 * Writes the watchdog script under `<cacheDir>/reaper/` (skipped when its
 * content-named file already exists — the filename encodes the content, so
 * presence means identity) and returns its path.
 */
export const ensureWatchdogScript = (cacheDir: string): Promise<string> => {
  const dir = watchdogDir(cacheDir)
  const content = watchdogScriptContent()
  const scriptPath = path.join(dir, watchdogScriptFilename(content))
  return fsp
    .access(scriptPath)
    .then(() => scriptPath)
    .catch(() => {
      const tmpPath = path.join(dir, `.watchdog-${process.pid}.tmp`)
      return fsp
        .mkdir(dir, { recursive: true })
        .then(() => fsp.writeFile(tmpPath, content))
        .then(() => fsp.chmod(tmpPath, 0o755))
        .then(() => fsp.rename(tmpPath, scriptPath))
        .then(
          () => scriptPath,
          (error: unknown) => {
            fsp.unlink(tmpPath).catch(() => {})
            throw error
          },
        )
    })
}

/** A spawned watchdog as the launcher sees it. */
export interface WatchdogHandle {
  /** Detaches the child (test/teardown seam) and drops the reference. */
  readonly close: () => void
}

/** The spawn seam tests inject — a detached child without a real process. */
export interface DetachedSpawn {
  readonly command: string
  readonly argv: ReadonlyArray<string>
  readonly killed: boolean
}

/**
 * Spawns the detached watchdog: `node <script> <paths...> <prefixes...>
 * <ownerPid>`, `detached: true` (outlives this process's death, SIGKILL
 * included), stdio ignored, unref'd — the whole point of the watchdog is
 * that nothing keeps it attached to this process's exit.
 */
export const spawnWatchdog = (
  args: WatchdogArgs,
  seam?: {
    readonly spawnChild?: ((command: string, argv: ReadonlyArray<string>) => { readonly close: () => void }) | undefined
  },
): Effect.Effect<WatchdogHandle> =>
  Effect.gen(function*() {
    const scriptPath = yield* Effect.promise(() => ensureWatchdogScript(args.cacheDir))
    const argv = [
      runEntriesPath(args.cacheDir, args.runId),
      // The networks live in the same entries file; the arg is kept so the
      // script's protocol has one path per ledger artifact.
      runEntriesPath(args.cacheDir, args.runId),
      runRecordPath(args.cacheDir, args.runId),
      joinPrefix(args.kill.stop),
      joinPrefix(args.kill.remove),
      joinPrefix(args.kill.removeNetwork),
      String(args.ownerPid),
    ]
    const spawnChild = seam?.spawnChild
    if (spawnChild !== undefined) {
      const child = spawnChild(process.execPath, [scriptPath, ...argv])
      return { close: child.close }
    }
    const child: ChildProcess = spawn(process.execPath, [scriptPath, ...argv], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    child.unref()
    return {
      close: () => {
        // Best-effort: the child is detached and unref'd; kill only when
        // this process is not exiting (the script exits on its own once its
        // owner is gone).
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      },
    }
  })

// =============================================================================
// The reaper bring-up + active-ledger state
// =============================================================================

/** The one-time init gate's deps — everything the ledger/sweep/watchdog need, resolved by the caller from config + selection (module seam, never a published projection). */
interface ReaperInitDeps {
  readonly cacheDir: string
  /** The backend this process resolves to — the sweep only ever reaps runs on it. */
  readonly backend: BackendName
  /** The kill command prefixes for that backend (the sweep and the watchdog both use them). */
  readonly kill: ReaperKillCommands
  /** The resolved `RIGHTSIZE_REAPER` mode. */
  readonly mode: ReaperMode
  /** The kill runner seam (defaults to spawnSyncKill) — tests record argv. */
  readonly runKill?: ((argv: ReadonlyArray<string>) => void) | undefined
  /** The liveness seam (defaults to the real one); tests fabricate dead/alive runs. */
  readonly timeSource?: ProcessTimeSource | undefined
  /** The watchdog spawn seam (defaults to real detached spawn). */
  readonly spawnChild?:
    | ((command: string, argv: ReadonlyArray<string>) => { readonly close: () => void })
    | undefined
}

interface ActiveLedger {
  readonly cacheDir: string
  readonly runId: string
  readonly backend: BackendName
}

let active: ActiveLedger | undefined
let heldWatchdog: WatchdogHandle | undefined
const inits = new Map<BackendName, Effect.Effect<void>>()

/** The one-time failed init is memoized — a broken cache dir must not retry per launch. */
const doInit = (deps: ReaperInitDeps): Effect.Effect<void> =>
  Effect.gen(function*() {
    if (deps.mode === 'off') {
      return
    }
    yield* Effect.promise(() => {
      const { cacheDir, backend } = deps
      return writeRunRecord(cacheDir, RunId.value, {
        pid: process.pid,
        startedIso: THIS_PROCESS_STARTED_ISO,
        backend,
      })
    })
    active = { cacheDir: deps.cacheDir, runId: RunId.value, backend: deps.backend }
    yield* Effect.promise(() => {
      const { cacheDir } = deps
      return sweepOnce({
        cacheDir,
        thisRunId: RunId.value,
        kill: deps.kill,
        runKill: deps.runKill,
        timeSource: deps.timeSource,
      })
    })
    if (deps.mode === 'on') {
      const spawnSeam = deps.spawnChild
      heldWatchdog = yield* spawnWatchdog(
        { cacheDir: deps.cacheDir, runId: RunId.value, ownerPid: process.pid, kill: deps.kill },
        { spawnChild: spawnSeam },
      )
    }
  })

/**
 * Arms the reaper for this process, once per backend — memoized so a
 * successful bring-up (or a swallowed failure) is not retried by every
 * launch. Best-effort end to end: any failure here leaves the ledger
 * inactive, and the launch proceeds (the container is still fully
 * functional; only orphan reaping is degraded).
 */
export const ensureReaperInitialized = (deps: ReaperInitDeps): Effect.Effect<void> => {
  const existing = inits.get(deps.backend)
  if (existing !== undefined) {
    return existing
  }
  const fresh = doInit(deps).pipe(Effect.catchEager(() => Effect.void))
  inits.set(deps.backend, fresh)
  return fresh
}

/** Appends a sandbox entry to this process's ledger — a no-op unless the reaper is active (mode `off` or a failed bring-up). Returns whether the entry was actually written. */
export const trackSandboxLedger = (
  entry: { readonly kind: 'sandbox'; readonly backend: BackendName; readonly name: string },
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (active === undefined) {
      return false
    }
    void appendSandboxEntry(active.cacheDir, active.runId, entry).catch(() => {})
    return true
  })

/** Records the backend-native id on an already-tracked sandbox's line, once create succeeded. */
export const recordSandboxIdLedger = (name: string, id: string): void => {
  if (active === undefined) {
    return
  }
  recordSandboxId(active.cacheDir, active.runId, name, id).catch(() => {})
}

/** Removes a sandbox entry from this process's ledger, pruning the run's files when nothing is left tracked. */
export const untrackSandboxLedger = (name: string): void => {
  if (active === undefined) {
    return
  }
  void removeSandboxEntry(active.cacheDir, active.runId, name).catch(() => {})
}

/** Appends a network id to this process's ledger — a no-op unless the reaper is active. */
export const trackNetworkLedger = (id: string): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (active === undefined) {
      return false
    }
    void appendNetworkEntry(active.cacheDir, active.runId, id).catch(() => {})
    return true
  })

/** Removes a network id from this process's ledger, pruning the run's files when nothing is left tracked. */
export const untrackNetworkLedger = (id: string): void => {
  if (active === undefined) {
    return
  }
  void removeNetworkEntry(active.cacheDir, active.runId, id).catch(() => {})
}

/** Whether the reaper is active — the executor's `ledgerTracked` fact and the caller of the ledger states. */
export const isLedgerActive = (): boolean => active !== undefined

/** Test seam: resets the memoized bring-up and the active state (never call from library code). */
export const _resetReaperForTests = (): void => {
  heldWatchdog?.close()
  heldWatchdog = undefined
  active = undefined
  inits.clear()
}

/** Test seam: the active ledger location, for assertions on where files landed. */
export const _activeLedgerForTests = (): ActiveLedger | undefined => active

/** Test seam: whether a watchdog was spawned and is still held. */
export const _heldWatchdogForTests = (): WatchdogHandle | undefined => heldWatchdog
