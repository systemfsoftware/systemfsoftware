import { spawn } from 'node:child_process'

import { BackendError } from '../model/errors.js'

/**
 * The one spawn-collect-timeout CLI runner shared by the two shell-out
 * edges (the docker backend's `runDockerCli` and the checkpoint archive's
 * `runTar`). Both callers shell out to a host binary the same way and with
 * the same rejection contract, so the difference is parameterized:
 *
 * - the binary label feeds the two rejection messages verbatim, so each
 *   caller's exact error text is preserved (`docker …` / `tar …`,
 *   `failed to spawn 'docker …'` / `failed to spawn 'tar …'`);
 * - `cwd` stays an option — `runTar` passes the archive's parent
 *   directory, `runDockerCli` inherits the process cwd;
 * - encoding is always utf8 and the child is killed via `spawn`'s own
 *   `timeout` option (no global timers), exactly like both originals.
 *
 * Rejection contract (shared): spawn failure and timeout are the two
 * rejections (`BackendError`); a nonzero exit is a RESULT, never a
 * rejection — the caller surfaces the tool's own stderr.
 *
 * Internal-only: the `internal/*` tree is sealed from the four published
 * entry points, so this runner is never part of the public surface.
 */
export interface SpawnCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/** One `binary <args>` invocation to completion. */
export const runSpawnCli = (
  binary: string,
  args: readonly string[],
  timeoutMs: number,
  options: { readonly cwd?: string } = {},
): Promise<SpawnCliResult> => {
  const { promise, resolve, reject } = Promise.withResolvers<SpawnCliResult>()
  const child = spawn(binary, [...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    cwd: options.cwd,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  let settled = false
  child.once('error', (err) => {
    if (settled) {
      return
    }
    settled = true
    if ((err as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      reject(
        BackendError.make({
          message: `${binary} ${args.join(' ')} timed out after ${timeoutMs}ms and was force-killed`,
        }),
      )
      return
    }
    reject(BackendError.make({ message: `failed to spawn '${binary} ${args.join(' ')}': ${err.message}` }))
  })

  child.once('close', (code) => {
    if (settled) {
      return
    }
    settled = true
    resolve({ exitCode: code ?? -1, stdout, stderr })
  })
  return promise
}
