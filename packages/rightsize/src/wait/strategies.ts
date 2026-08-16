/**
 * Wait-strategy constructors (R11) — the data-shaped counterparts of the
 * upstream `Wait.*` factories. Each constructor returns the plain tagged
 * value the `WaitStrategy` union codecs, so a strategy serializes with its
 * spec and the interpreter (R11's one interpreter) is the only consumer.
 *
 * The shapes are canonical: optional keys are omitted rather than written
 * as `undefined` (matching how the module presets hand-build their
 * strategies — `spec-builder.kernel.test.ts` pins `{ _tag: 'ForLogMessage',
 * pattern, count }`), and the defaults mirror upstream's factories:
 * `forHttp(path)` expects status 200, `forLogMessage(pattern)` counts 1,
 * `forHealthCheck()` waits for `healthy`.
 */
import type {
  ForHealthCheck,
  ForHttp,
  ForLogMessage,
  ForPort,
  ForShell,
  HealthStatus,
  HttpBodyMatcher,
  HttpMethod,
} from '../model/wait.schema.js'

/** Ready once every exposed port accepts a read probe. The default strategy. */
export const forPort = (): ForPort => ({ _tag: 'ForPort' })

/** Options for `forHttp` — the testcontainers `.forPort/.forStatusCode/…` chain as data, plus the body predicate. */
export interface ForHttpOptions {
  /** Probe this guest port instead of the first exposed one. */
  readonly port?: number | undefined
  /** Expect this status code instead of 200. */
  readonly status?: number | undefined
  /** The probe method; default `GET`. */
  readonly method?: HttpMethod | undefined
  /** Extra headers the probe request carries. */
  readonly headers?: Readonly<Record<string, string>> | undefined
  /** A body predicate the response must satisfy to be ready. */
  readonly body?: HttpBodyMatcher | undefined
}

/** A body predicate: ready when the response body contains `value`. */
export const bodyContains = (value: string): HttpBodyMatcher => ({ _tag: 'BodyContains', value })

/** A body predicate: ready when the response body matches `pattern` (a RegExp source). */
export const bodyMatches = (pattern: string): HttpBodyMatcher => ({ _tag: 'BodyMatches', pattern })

/** Ready once an HTTP request to `path` returns the expected status (200) with an optional body match. */
export const forHttp = (path: string, options: ForHttpOptions = {}): ForHttp => ({
  _tag: 'ForHttp',
  path,
  ...(options.port === undefined ? {} : { port: options.port }),
  ...(options.status === undefined ? {} : { status: options.status }),
  ...(options.method === undefined ? {} : { method: options.method }),
  ...(options.headers === undefined ? {} : { headers: options.headers }),
  ...(options.body === undefined ? {} : { body: options.body }),
})

/**
 * Ready once `pattern` matches at least `count` distinct log lines.
 * `count` 0 means instantly ready, without logs even being fetched
 * (upstream's `Wait.forLogMessage(pattern, times)` contract).
 */
export const forLogMessage = (pattern: string, count = 1): ForLogMessage => ({ _tag: 'ForLogMessage', pattern, count })

/** Ready once the backend reports the docker health status `status` (default `healthy`); capability-gated in the interpreter. */
export const forHealthCheck = (status: HealthStatus = 'healthy'): ForHealthCheck =>
  status === 'healthy' ? { _tag: 'ForHealthCheck' } : { _tag: 'ForHealthCheck', status }

/** Ready once the shell command exits 0 inside the container (testcontainers' `forShellCommand` as data). */
export const forShell = (command: string): ForShell => ({ _tag: 'ForShell', command })

/** The upstream-shaped factory namespace: `Wait.forListeningPort`/`forHttp`/`forLogMessage` plus the port-plan additions. */
export const Wait = {
  /** The upstream name for the default port strategy. */
  forListeningPort: forPort,
  /** Ready once every exposed port read-probes ready. */
  forPort,
  /** Ready once an HTTP request matches status and body. */
  forHttp,
  /** Ready once a log line pattern matched enough times. */
  forLogMessage,
  /** Ready once the docker health status reports in. */
  forHealthCheck,
  /** Ready once a shell command exits 0. */
  forShell,
}
