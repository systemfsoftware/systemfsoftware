/**
 * The docker CLI shell-out surface: pure argv construction for the
 * operations this backend deliberately does NOT drive over the Engine API,
 * plus the process runner for them (behavioral reference: upstream
 * rightsize-node `src/backend-docker/cli.ts` at the fork point, Apache-2.0).
 *
 * `docker cp`, `docker save` and `docker load` shell out exactly where
 * upstream does: encoding/decoding a tar stream by hand (or adding a
 * third-party Docker SDK) just to reach the same daemon endpoint `docker cp`
 * already wraps isn't worth a new dependency, and the reaper's kill-command
 * prefixes already make the `docker` CLI a hard requirement for this
 * backend. `runDockerCli` never rejects on a nonzero exit — that is a
 * verdict surfaced to the caller — only on spawn failure or timeout.
 *
 * The argv shapes are unit-tested against their recorded vectors; no test in
 * this unit talks to a real daemon.
 *
 * @since 0.1.0
 */
import { spawnSync } from 'node:child_process'

import { runSpawnCli } from '../internal/spawn.js'

/** One `docker <args>` invocation's outcome — never rejects on a nonzero exit, only on spawn failure or timeout. */
export interface DockerCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/** Pure argv construction for the shelled-out docker operations. */
export const DockerCli = {
  /** `docker cp <hostPath> <id>:<containerPath>` — host-to-guest transfer. */
  copyIn(hostPath: string, id: string, containerPath: string): string[] {
    return ['cp', hostPath, `${id}:${containerPath}`]
  },
  /** `docker cp <id>:<containerPath> <hostPath>` — the reverse direction. */
  copyOut(id: string, containerPath: string, hostPath: string): string[] {
    return ['cp', `${id}:${containerPath}`, hostPath]
  },
  /** `docker save -o <destFile> <tag>` — `exportCheckpoint`'s backend call; the tag is preserved inside the archive. */
  save(destFile: string, tag: string): string[] {
    return ['save', '-o', destFile, tag]
  },
  /** `docker load -i <srcFile>` — `importCheckpoint`/`importImage`'s backend call; loading re-points the tag if it already exists. */
  load(srcFile: string): string[] {
    return ['load', '-i', srcFile]
  },
}

/**
 * Runs one `docker <args>` invocation to completion over a child process.
 * Spawn failure and timeout (the child is killed via `spawn`'s own `timeout`
 * option — no global timers) are the two rejections; a nonzero exit code is
 * returned as data so the caller can surface the tool's own stderr. The
 * spawn-collect-timeout runner is shared with the checkpoint archive's
 * `runTar` (the same contract, the `docker` binary label in the messages).
 */
export const runDockerCli = (args: readonly string[], timeoutMs: number): Promise<DockerCliResult> =>
  runSpawnCli('docker', args, timeoutMs)

/**
 * The kill-command prefixes the hygiene reaper and watchdog use for a
 * docker backend: `docker rm -f` does stop+remove in one call (so `stop` is
 * empty) and network removal is `docker network rm` (upstream
 * `SandboxBackend.reaperKillCommand`).
 */
export const DOCKER_REAPER_KILL_COMMAND: {
  readonly stop: readonly string[]
  readonly remove: readonly string[]
  readonly removeNetwork: readonly string[]
} = { stop: [], remove: ['docker', 'rm', '-f'], removeNetwork: ['docker', 'network', 'rm'] }

/**
 * The blocking-cleanup primitive the hygiene unit's sync-exit registry
 * registers for this backend (R6): given the daemon's unix socket path,
 * returns a function that synchronously force-removes one container by id.
 *
 * Node has no synchronous HTTP client, so this shells out to
 * `curl --unix-socket` via `child_process.spawnSync` — curl ships on macOS
 * and virtually every Linux CI image, and `spawnSync` genuinely blocks the
 * exiting process the way an `"exit"` handler requires. If curl is
 * unavailable, this is a silent no-op: the label-scoped orphan reaper is the
 * real safety net for that case, not this best-effort fast path.
 *
 * The registry itself (which ids to reap and when) belongs to the hygiene
 * unit; this module only supplies the per-backend blocking call.
 */
export const registerDockerCleanupSync = (socketPath: string): (id: string) => void => (id: string): void => {
  try {
    spawnSync('curl', [
      '--silent',
      '--max-time',
      '5',
      '--unix-socket',
      socketPath,
      '-X',
      'DELETE',
      `http://localhost/containers/${id}?force=true`,
    ])
  } catch {
    // Best-effort — see the doc above.
  }
}

/** The blocking per-id cleanup shape U4's sync-exit registry stores per backend. */
export type DockerCleanupSync = (id: string) => void
