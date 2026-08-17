/**
 * The sync-exit registry (R6) — the process-exit teardown path, the
 * JVM-shutdown-hook analog for a process that dies (or is asked to die)
 * before its scopes unwind normally.
 *
 * Node's `process.on('exit', ...)` handler runs SYNCHRONOUSLY and cannot
 * `await` — by the time it fires, the event loop is already being torn
 * down, so a backend's real async `stop()`/`remove()` cannot run there.
 * Each backend therefore supplies a synchronous, blocking teardown
 * primitive (`registerDockerCleanupSync`'s curl DELETEs, msb's
 * `spawnSync` stop+rm — upstream's mechanism, kept, R6), and the launch
 * executor registers one of those per live container here. This module
 * only owns the REGISTRY and the process hooks; it has no opinion on how
 * any one backend tears a container down.
 *
 * This is a last-resort backstop, not the primary cleanup path — the
 * primary path is the launch executor's scope finalizer / explicit
 * `stop()`. SIGKILL bypasses even this (no handler runs at all); the
 * orphan reaper each process's sweep runs over the on-disk ledger is the
 * backstop for that case. A keepAlive container is never registered
 * (its whole point is to outlive this process), and a clean explicit
 * teardown unregisters before the exit handler could ever see it.
 *
 * The `"exit"` handler runs every registered cleanup synchronously, each
 * guarded by its own try/catch — one container's blocked cleanup must not
 * stop the others, and nothing here ever throws. SIGINT/SIGTERM run the
 * same synchronous cleanup, then re-raise the signal so the process still
 * exits the way it would have without this handler.
 */

/** One synchronous, blocking, never-throwing container teardown. */
export type SyncCleanup = () => void

/** A registered entry keyed by its container id. */
interface RegisteredCleanup {
  readonly cleanup: SyncCleanup
}

const registered = new Map<string, RegisteredCleanup>()
let hooksInstalled = false

/** Runs every registered cleanup exactly once, best-effort, then clears the registry. Never throws. */
const runAll = (): void => {
  for (const entry of registered.values()) {
    try {
      entry.cleanup()
    } catch {
      // Best-effort: a failure to clean one container must not block the
      // others, and the process is exiting regardless.
    }
  }
  registered.clear()
}

const installHooksOnce = (): void => {
  if (hooksInstalled) {
    return
  }
  hooksInstalled = true

  process.on('exit', runAll)

  // SIGINT/SIGTERM: run the same synchronous cleanup, then re-raise the
  // signal so the process still exits the way it would have without this
  // handler (correct exit code, no swallowed Ctrl-C).
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      runAll()
      process.removeAllListeners(signal)
      process.kill(process.pid, signal)
    })
  }
}

/**
 * Registers a synchronous teardown for a live container, keyed by its
 * handle id. Registered cleanups run on process exit / SIGINT / SIGTERM,
 * and are removed by `unregisterSyncCleanup` once the container is torn
 * down the clean way.
 */
export const registerSyncCleanup = (handleId: string, cleanup: SyncCleanup): void => {
  installHooksOnce()
  registered.set(handleId, { cleanup })
}

/** Unregisters a container's teardown once it has been stopped/removed normally. Never throws. */
export const unregisterSyncCleanup = (handleId: string): void => {
  registered.delete(handleId)
}

/** The currently registered handle ids — the registry's live view (also the diagnostics data source). */
export const syncCleanupIds = (): ReadonlyArray<string> => [...registered.keys()]

/**
 * Test seam: runs every registered cleanup exactly the way the real "exit"
 * handler does (best-effort, swallowing failures, then clearing the
 * registry) without terminating the test process.
 */
export const _runAllForTests = (): void => {
  runAll()
}

/** Test seam: clears registered cleanups without running them. */
export const _resetForTests = (): void => {
  registered.clear()
}

/** Test seam: whether a handle id is currently registered. */
export const _isRegisteredForTests = (handleId: string): boolean => registered.has(handleId)
