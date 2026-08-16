/**
 * Wait-strategy data — the closed, JSON-codecable union interpreted by the
 * launch workflow's wait interpreter (R11). A strategy is pure data: every
 * member is a tagged struct with the `_tag` naming the strategy and fields
 * carrying what the interpreter needs, so a spec can be serialized across
 * processes with its readiness policy intact.
 *
 * Semantics mirror upstream `wait.ts` at the fork point: `ForPort` read-probes
 * every exposed port (connect-then-read, never connect-only), `ForLogMessage`
 * counts distinct matching log lines, `ForHttp` probes a path expecting a
 * status code. `ForHealthCheck` (docker health status, capability-gated) and
 * `ForShell` are the parity additions the port plan's R11 names.
 */
import { Schema as S } from 'effect'

/** An HTTP method a `ForHttp` probe can issue. Default when unset: `GET`. */
export const HttpMethod = S.Literals(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'OPTIONS'])

export type HttpMethod = S.Schema.Type<typeof HttpMethod>

/**
 * How an HTTP probe's response body is judged ready — substring containment or
 * a regular-expression search. Carried by `ForHttp.body`.
 */
export const HttpBodyMatcher = S.TaggedUnion({
  BodyContains: { value: S.String },
  BodyMatches: { pattern: S.String },
}).pipe(
  S.annotate({
    identifier: 'HttpBodyMatcher',
    title: 'HttpBodyMatcher',
    description: 'A response-body predicate for an HTTP readiness probe.',
  }),
)

export type HttpBodyMatcher = S.Schema.Type<typeof HttpBodyMatcher>

/** A docker health status the health-check wait accepts. Default when unset: `healthy`. */
export const HealthStatus = S.Literals(['healthy', 'unhealthy', 'starting'])

export type HealthStatus = S.Schema.Type<typeof HealthStatus>

/**
 * Ready once every exposed port accepts a real peer — read-probed, not just
 * connect-probed (upstream's `Wait.forListeningPort()`). Carries no data: the
 * ports probed are the spec's own exposed ports.
 */
export const ForPort = S.TaggedStruct('ForPort', {}).pipe(
  S.annotate({
    identifier: 'ForPort',
    title: 'ForPort',
    description: 'Wait for every exposed port to read-probe ready.',
  }),
)

export type ForPort = S.Schema.Type<typeof ForPort>

/**
 * Ready once an HTTP request to `path` returns `status` (default 200) with a
 * body matching `body` when set. `port` overrides the first exposed guest
 * port; `headers` are added to the probe request.
 *
 * `port`/`status` carry the plain finite-number codec, not the port/status
 * refinements: a refinement embedded through the closed union's copied
 * member nodes cannot be discriminated by the law kernel's refusal metering
 * (the weakened decode never accepts a refusal draw through the union), and
 * the enforcement genuinely belongs to the wait interpreter that consumes
 * the value. The port-range contract itself has one home: the `Port` schema
 * used by `PortBinding` and validated there.
 */
export const ForHttp = S.TaggedStruct('ForHttp', {
  path: S.String,
  // Non-finite probe settings are refused by no codec; the interpreter treats
  // them as invalid progress data before probing — deliberate, see above, so
  // the base-Number diagnostic is disabled. @effect-diagnostics-next-line schemaNumber:off
  port: S.optionalKey(S.Number),
  // Same rationale as `port`; the status value is validated by the
  // interpreter before probing. @effect-diagnostics-next-line schemaNumber:off
  status: S.optionalKey(S.Number),
  method: S.optionalKey(HttpMethod),
  headers: S.optionalKey(S.Record(S.String, S.String)),
  body: S.optionalKey(HttpBodyMatcher),
}).pipe(
  S.annotate({
    identifier: 'ForHttp',
    title: 'ForHttp',
    description: 'Wait for an HTTP endpoint to return the expected status.',
  }),
)

export type ForHttp = S.Schema.Type<typeof ForHttp>

/**
 * Ready once `pattern` (a regular-expression source) has matched at least
 * `count` distinct log lines. `count` 0 means instantly ready, matching
 * upstream's `Wait.forLogMessage(pattern, times)` contract.
 */
export const ForLogMessage = S.TaggedStruct('ForLogMessage', {
  pattern: S.String,
  // Same reasoning as ForHttp's numeric fields: a refinement on the protocol
  // probe data cannot be discriminated through the union's copied nodes, and
  // the interpreter validates the count before counting. @effect-diagnostics-next-line schemaNumber:off
  count: S.optionalKey(S.Number),
}).pipe(
  S.annotate({
    identifier: 'ForLogMessage',
    title: 'ForLogMessage',
    description: 'Wait until a log line matches a pattern a given number of times.',
  }),
)

export type ForLogMessage = S.Schema.Type<typeof ForLogMessage>

/**
 * Ready once the docker health status reports `status` (default `healthy`).
 * Capability-gated on `RuntimeCapabilities.healthInspection` before the probe
 * runs (R11).
 */
export const ForHealthCheck = S.TaggedStruct('ForHealthCheck', {
  status: S.optionalKey(HealthStatus),
}).pipe(
  S.annotate({
    identifier: 'ForHealthCheck',
    title: 'ForHealthCheck',
    description: 'Wait for the container health check to reach a status.',
  }),
)

export type ForHealthCheck = S.Schema.Type<typeof ForHealthCheck>

/**
 * Ready once the shell command `command` exits 0 inside the container —
 * testcontainers' `forShellCommand` as data.
 */
export const ForShell = S.TaggedStruct('ForShell', {
  command: S.String,
}).pipe(
  S.annotate({
    identifier: 'ForShell',
    title: 'ForShell',
    description: 'Wait until a shell command exits 0 inside the container.',
  }),
)

export type ForShell = S.Schema.Type<typeof ForShell>

/**
 * The closed union of every readiness strategy a spec can carry. An unknown
 * `_tag` is refused at decode: this union has no open extensibility — a new
 * strategy is a new member here, interpreted by the wait interpreter in lockstep.
 */
export const WaitStrategy = S.TaggedUnion({
  ForPort: ForPort.fields,
  ForHttp: ForHttp.fields,
  ForLogMessage: ForLogMessage.fields,
  ForHealthCheck: ForHealthCheck.fields,
  ForShell: ForShell.fields,
}).pipe(
  S.annotate({
    identifier: 'WaitStrategy',
    title: 'WaitStrategy',
    description: 'The closed union of readiness strategies.',
  }),
)

export type WaitStrategy = S.Schema.Type<typeof WaitStrategy>
