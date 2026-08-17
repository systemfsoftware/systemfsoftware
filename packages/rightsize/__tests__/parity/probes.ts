/**
 * Observable probes for the docker parity lane — test-side observation
 * utilities only: port reachability, polling, and out-of-band daemon state
 * queries. This module deliberately never imports `effect`: the package's
 * lint rules (`no-new-promise-in-effect`, `no-native-settimeout-in-effect`)
 * reserve those constructs for Effect-native pipelines, and these helpers
 * are plain Promise utilities a test asserts on (mirroring upstream's
 * contract-suite `portIsReachable`/`waitUntil`, which the lane ports).
 */
import { spawnSync } from 'node:child_process'
import * as net from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * A zero-byte connect+read probe: resolves `true` if the peer sends data or
 * holds the connection open, `false` on immediate EOF/refusal (upstream's
 * contract-suite `portIsReachable`).
 */
export const portIsReachable = (port: number, timeoutMs = 500): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = net.connect(port, '127.0.0.1')
  let settled = false
  const finish = (value: boolean): void => {
    if (settled) {
      return
    }
    settled = true
    socket.destroy()
    resolve(value)
  }
  socket.once('connect', () => {
    socket.setTimeout(timeoutMs)
    socket.once('data', () => finish(true))
    socket.once('timeout', () => finish(true))
    socket.once('end', () => finish(false))
  })
  socket.once('error', () => finish(false))
  return promise
}

/** Polls `predicate` until it is truthy or `timeoutMs` elapses. */
export const waitUntil = (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  pollMs = 200,
): Promise<boolean> => {
  // `performance.now`, not `Date.now`: the effect compiler plugin routes
  // wall-clock reads through the platform monotonic clock so a poll budget
  // cannot be confused with datetime data (same reason the sleep comes
  // from `timers/promises`, not the global `setTimeout`).
  const deadline = performance.now() + timeoutMs
  const tick = (): Promise<boolean> =>
    Promise.resolve()
      .then(predicate)
      .catch(() => false)
      .then((ready): Promise<boolean> => {
        if (ready) {
          return Promise.resolve(true)
        }
        if (performance.now() >= deadline) {
          return Promise.resolve(false)
        }
        return sleep(pollMs).then(() => tick())
      })
  return tick()
}

/**
 * A typed `undefined` for optional-result fallbacks: `Effect.succeed` over
 * the literal `undefined` trips the effect plugin's void-outcome rule, but
 * a channel declared `A | undefined` is not a void outcome — this binding
 * says so at the type level.
 */
export const noExec = (): undefined => undefined

/** One out-of-band `docker <args>` query (test-side daemon observation; the library under test never sees it). */
export const dockerCli = (
  args: readonly string[],
): { readonly exitCode: number; readonly stdout: string; readonly stderr: string } => {
  const result = spawnSync('docker', [...args], { encoding: 'utf8' })
  return { exitCode: result.status ?? -1, stdout: String(result.stdout), stderr: String(result.stderr) }
}

/** Does the daemon still know a network with this name exists? */
export const networkExists = (networkId: string): boolean => dockerCli(['network', 'inspect', networkId]).exitCode === 0

/** Does the daemon still see a container with this id? */
export const containerExists = (id: string): boolean => dockerCli(['inspect', '--format', '{{.Id}}', id]).exitCode === 0

/** Does the daemon still hold an image under this ref? */
export const imageExists = (ref: string): boolean =>
  dockerCli(['image', 'inspect', '--format', '{{.Id}}', ref]).exitCode === 0
