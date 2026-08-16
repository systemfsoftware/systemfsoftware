/**
 * The checkpoint-archive tar container (R14) — pure argv construction plus
 * one spawn edge for the host `tar` binary. Behavioral source: upstream
 * rightsize-node `src/core/checkpoint/tar-cli.ts` (Apache-2.0).
 *
 * A plain tar (not a project-specific packer) because the tool already
 * exists on every platform this library ships for (Linux, macOS, and
 * Windows 10+ as bsdtar's `tar.exe`).
 */
import { spawn } from 'node:child_process'

import { BackendError } from '../model/errors.js'

/** One `tar <args>` invocation's outcome — never rejects on a nonzero exit, only on spawn failure or timeout. */
export interface TarCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * Pure argv construction for the host `tar` binary. The archive is named by
 * BASENAME only: an absolute Windows path in `-f` (`C:\...`) is parsed by
 * GNU tar as a `host:path` remote-archive spec ("Cannot connect to C"), and
 * which flavor `tar` resolves to on Windows depends on PATH order. `runTar`
 * pairs this with `cwd` = the archive's parent directory, which both
 * flavors handle identically.
 */
export const TarCli = {
  /**
   * `tar -cf <archive basename> -C <workDir> <members...>` — members are
   * written at the tar's root, never nested under `workDir`'s own path.
   */
  create(archiveBasename: string, workDir: string, members: readonly string[]): string[] {
    return ['-cf', archiveBasename, '-C', tarDirArg(workDir), ...members]
  },
  /** `tar -xf <archive basename> -C <destDir>` — extracts every member into `destDir`. */
  extract(archiveBasename: string, destDir: string): string[] {
    return ['-xf', archiveBasename, '-C', tarDirArg(destDir)]
  },
}

/**
 * Normalizes a directory path for tar's `-C` argument: on Windows, Git's
 * GNU (MSYS) tar mangles backslash paths (`C:\Users\...` arrives as
 * `C\:\\Users\\...` and fails "Cannot open"), while both it and System32's
 * bsdtar accept the same path with forward slashes. Elsewhere the path is
 * returned untouched — a backslash is a legal filename character on POSIX.
 */
export function tarDirArg(dir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? dir.replaceAll('\\', '/') : dir
}

/**
 * Runs one `tar <args>` invocation to completion over a child process —
 * the one operation a checkpoint archive needs that isn't a backend CLI
 * call. Shelling out for the same reason the docker backend shells out to
 * `docker cp`: the tool already exists on every platform this library
 * ships for. Spawn failure and timeout (the child is killed via `spawn`'s
 * own `timeout` option — no global timers) are the two rejections; a
 * nonzero tar exit is a result, never a rejection.
 */
export const runTar = (args: readonly string[], timeoutMs: number, cwd: string): Promise<TarCliResult> => {
  const { promise, resolve, reject } = Promise.withResolvers<TarCliResult>()
  const child = spawn('tar', [...args], { stdio: ['ignore', 'pipe', 'pipe'], cwd, timeout: timeoutMs })
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
        BackendError.make({ message: `tar ${args.join(' ')} timed out after ${timeoutMs}ms and was force-killed` }),
      )
      return
    }
    reject(BackendError.make({ message: `failed to spawn 'tar ${args.join(' ')}': ${err.message}` }))
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
