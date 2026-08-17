/**
 * The hand-rolled Docker Engine API client — a unix-socket-only transport
 * built on `node:http`'s `socketPath` option rather than a general-purpose
 * Docker SDK (`dockerode`) — the point of hand-rolling is that this client
 * can only ever dial a unix socket path, never a TCP host
 * (behavioral reference: upstream rightsize-node
 * `src/backend-docker/client.ts` at the fork point, Apache-2.0; R9).
 *
 * A shared HTTP stack a consuming project also depends on has, on another
 * runtime, been observed to misroute a Docker client onto TCP
 * `localhost:2375` instead of the daemon's real unix socket; owning this
 * client end-to-end makes that misrouting structurally impossible. `tcp://`
 * `DOCKER_HOST` is the documented non-goal (R9) and is refused with the
 * same typed error discovery uses — never silently rerouted (upstream's
 * fallback-to-default-socket behavior is deliberately not ported).
 *
 * Every daemon endpoint this backend calls returns either a small buffered
 * JSON body (unary calls — `request`) or a stream of raw framed bytes
 * (`exec`/`logs` — `requestStream`). Both go through ordinary HTTP
 * responses, never `/attach`'s connection hijack, so `node:http`'s
 * `IncomingMessage` is sufficient either way.
 *
 * No connection pooling (`agent: false`): every call opens its own
 * connection that node:http tears down as soon as the response ends, so a
 * short-lived process never lingers on an idle pooled socket handle.
 *
 * Timeouts use the `node:http` socket-timeout APIs (`req.setTimeout` /
 * `res.setTimeout`) rather than global timers, so the wedged-daemon ceilings
 * share the socket lifecycle they bound.
 *
 * @since 0.1.0
 */
import { Effect, Schema as S } from 'effect'
import * as Result from 'effect/Result'
import * as http from 'node:http'
import type { IncomingMessage } from 'node:http'
import { BackendError } from '../model/errors.js'
import { UnsupportedDockerHostError } from '../runtime/discovery/discovery.adapter.js'
import { classifyDockerHost } from '../runtime/discovery/probe.js'

/** The daemon's default unix socket path (mirrors `DEFAULT_DOCKER_SOCKET` in the probe kernel). */
const DEFAULT_SOCKET_PATH = '/var/run/docker.sock'

/**
 * Ceiling on one unary request/response cycle — connect, write, read
 * headers, read the whole body. Deliberately NOT applied to streaming reads
 * (`followLogs`): that call is meant to block for as long as the workload
 * runs, so bounding it here would kill a perfectly healthy long-lived
 * stream. Unary calls (create/start/stop/exec-inspect/logs/ls) get it
 * because a wedged daemon must fail the caller promptly instead of hanging
 * the whole test run.
 */
const RESPONSE_TIMEOUT_MS = 600_000

/**
 * Ceiling on connecting to the daemon's unix socket and receiving response
 * headers — the phase before `RESPONSE_TIMEOUT_MS`'s body-reading window
 * even starts. Without this, a request whose connection or header phase
 * never completes hangs forever with nothing else timing it out.
 */
const CONNECT_TIMEOUT_MS = 30_000

/** A fully-buffered daemon response, returned by `DockerClient.request`. */
export interface DockerResponse {
  /** The HTTP status code. */
  readonly status: number
  /** The full response body. */
  readonly body: Buffer
}

/** A daemon response whose body is left as a live stream, returned by `DockerClient.requestStream` for `exec`/`logs` calls. */
export interface DockerStreamResponse {
  /** The HTTP status code. */
  readonly status: number
  /** The raw, already-de-chunked response stream — the frame demuxer only ever sees raw framed bytes. */
  readonly body: IncomingMessage
}

/** On-behavior for a request that threw a non-{@link BackendError}. */
const toBackendError = (method: string, path: string, err: unknown): BackendError =>
  S.is(BackendError)(err)
    ? err
    : BackendError.make({
      message: `docker ${method} ${path} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    })

/**
 * The pure seam `DockerClient.fromEnv` delegates to: given a `DOCKER_HOST`
 * value (or `undefined`), decides which unix socket path to dial. A
 * `unix://`-prefixed value or an absolute path is usable; anything else
 * (`tcp://`, a bare host, `ssh://`…) is the documented non-goal and fails
 * with {@link UnsupportedDockerHostError} rather than silently rerouting.
 */
export const socketPathFromDockerHost = (
  host: string | undefined,
): Result.Result<string, UnsupportedDockerHostError> => {
  const classified = classifyDockerHost(host)
  if (classified.kind === 'unix') {
    return Result.succeed(classified.socketPath)
  }
  if (classified.kind === 'unset') {
    // Unset (or empty) DOCKER_HOST means the daemon's default socket.
    return Result.succeed(DEFAULT_SOCKET_PATH)
  }
  return Result.fail(
    UnsupportedDockerHostError.make({
      dockerHost: classified.value,
      reason:
        'only unix sockets are supported (unix://… or an absolute path); tcp:// DOCKER_HOST is a documented non-goal',
    }),
  )
}

/**
 * The unix-socket-only Engine API client surface. Construction is pure (it
 * holds a path); every daemon call is an `Effect` whose error channel
 * carries only `BackendError` (a wedged daemon fails the caller promptly,
 * never hangs it). An interface + factory rather than a class — the
 * package's `ban-classes` gate reserves classes for schemas and context
 * tags.
 */
export interface DockerClient {
  /** The unix socket path this client dials — never a TCP host. */
  readonly socketPath: string
  /**
   * One request whose entire response body is read into memory before
   * returning — every daemon call this backend makes except `exec`/`logs`
   * streaming (`requestStream`). Bounded by `RESPONSE_TIMEOUT_MS` so a
   * wedged daemon fails with a named error instead of hanging the caller.
   */
  readonly request: (method: string, path: string, body?: string) => Effect.Effect<DockerResponse, BackendError>
  /**
   * One unary request with extra headers — the engine's pull-with-auth path
   * (`X-Registry-Auth`) rides here; every other backend call goes through
   * `request`.
   */
  readonly requestWithHeaders: (
    method: string,
    path: string,
    body: string | undefined,
    headers: Record<string, string>,
  ) => Effect.Effect<DockerResponse, BackendError>
  /**
   * Issues a request and returns the status plus the still-open response
   * stream, for callers (`exec`/`logs`, the frame demuxer) that consume a
   * de-chunked body incrementally rather than buffering it all first.
   * Deliberately NOT bounded by `RESPONSE_TIMEOUT_MS` — `followLogs`
   * streams for as long as the workload runs, by design.
   */
  readonly requestStream: (
    method: string,
    path: string,
    body?: string,
  ) => Effect.Effect<DockerStreamResponse, BackendError>
}

/** Constructs a client dialing the given unix socket. */
export const makeDockerClient = (
  socketPath: string = DEFAULT_SOCKET_PATH,
  // Test seam: production call sites never pass this; a fixture proving
  // the timeout path fires constructs with a much smaller override.
  connectTimeoutMs: number = CONNECT_TIMEOUT_MS,
): DockerClient => {
  /** Buffers one entire unary response body, bounded by `RESPONSE_TIMEOUT_MS`. */
  const bufferedRequest = (
    method: string,
    path: string,
    body?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<DockerResponse> => {
    const { promise, resolve, reject } = Promise.withResolvers<DockerResponse>()
    send(method, path, body, extraHeaders).then(
      ({ res }) => resolve(readBody(res, method, path)),
      (err: unknown) => reject(err instanceof Error ? err : new Error('docker request failed', { cause: err })),
    )
    return promise
  }

  /** Reads one response body to completion. Unary calls only (`request`/`requestWithHeaders`). */
  const readBody = (res: IncomingMessage, method: string, path: string): Promise<DockerResponse> => {
    const { promise, resolve, reject } = Promise.withResolvers<DockerResponse>()
    const chunks: Buffer[] = []
    let settled = false
    const onTimeout = (): void => {
      if (settled) {
        return
      }
      settled = true
      res.destroy()
      reject(
        BackendError.make({
          message: `${method} ${path} to the Docker daemon did not complete within ${RESPONSE_TIMEOUT_MS / 1000}s`,
        }),
      )
    }
    res.setTimeout(RESPONSE_TIMEOUT_MS, onTimeout)
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => {
      if (settled) {
        return
      }
      settled = true
      res.setTimeout(0)
      resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) })
    })
    res.on('error', (err) => {
      if (settled) {
        return
      }
      settled = true
      res.setTimeout(0)
      reject(BackendError.make({ message: `reading a response from the Docker daemon: ${err.message}` }))
    })
    return promise
  }

  const send = (
    method: string,
    path: string,
    body?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<{ res: IncomingMessage }> => {
    const { promise, resolve, reject } = Promise.withResolvers<{ res: IncomingMessage }>()
    const headers: Record<string, string> = { ...extraHeaders }
    if (body !== undefined) {
      headers['Content-Length'] = String(Buffer.byteLength(body))
      headers['Content-Type'] = 'application/json'
    }
    let settled = false
    const req = http.request(
      {
        socketPath,
        method,
        path,
        headers,
        // See the module doc: no connection pooling, so nothing lingers.
        agent: false,
      },
      (res) => {
        if (settled) {
          return
        }
        settled = true
        req.setTimeout(0)
        resolve({ res })
      },
    )
    const onConnectTimeout = (): void => {
      if (settled) {
        return
      }
      settled = true
      req.destroy()
      reject(
        BackendError.make({
          message: `${method} ${path} to the Docker daemon at ${socketPath} did not connect/respond within ` +
            `${connectTimeoutMs / 1000}s — is the daemon running and responsive?`,
        }),
      )
    }
    req.setTimeout(connectTimeoutMs, onConnectTimeout)
    req.on('error', (err) => {
      if (settled) {
        return
      }
      settled = true
      req.setTimeout(0)
      reject(
        BackendError.make({
          message: `could not connect to the Docker daemon at ${socketPath} — ` +
            `is Docker/Podman/Colima running? (${err.message})`,
        }),
      )
    })
    if (body !== undefined) {
      req.write(body)
    }
    req.end()
    return promise
  }

  return {
    socketPath,
    request: (method, path, body) =>
      Effect.tryPromise({
        try: () => bufferedRequest(method, path, body),
        catch: (err) => toBackendError(method, path, err),
      }),
    requestWithHeaders: (method, path, body, headers) =>
      Effect.tryPromise({
        try: () => bufferedRequest(method, path, body, headers),
        catch: (err) => toBackendError(method, path, err),
      }),
    requestStream: (method, path, body) =>
      Effect.tryPromise({
        try: () => send(method, path, body).then(({ res }) => ({ status: res.statusCode ?? 0, body: res })),
        catch: (err) => toBackendError(method, path, err),
      }),
  }
}

/**
 * Builds a client honoring `DOCKER_HOST` (a `unix://` path, a bare path,
 * or unset → the daemon's default socket). A non-unix `DOCKER_HOST` is the
 * documented non-goal failure.
 */
export const dockerClientFromEnv = (): Result.Result<DockerClient, UnsupportedDockerHostError> =>
  Result.map(socketPathFromDockerHost(process.env['DOCKER_HOST']), (path) => makeDockerClient(path))
