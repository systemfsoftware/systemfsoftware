/**
 * Wire declaration for the Engine API's `GET /containers/{id}/logs` query
 * parameters, plus the canonical query-string encoder.
 *
 * `follow` and `tail` are the long-running shape (`followLogs`); the bounded
 * snapshot (`logs`) sends `stdout=1&stderr=1&tail=1000` with no `follow`.
 * The encoder emits deterministic, order-stable query strings so daemon-side
 * behavior never depends on caller key order.
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** The logs query every container-log call this backend makes. */
export const LogsQuery = Wire.wire({
  stdout: Wire.boolean,
  stderr: Wire.boolean,
  follow: Wire.boolean,
  /** `"all"` or a positive tail count. */
  tail: Wire.union(Wire.literal('all'), Wire.integer),
})
export type LogsQuery = S.Schema.Type<typeof LogsQuery>

/** The canonical query string for {@link LogsQuery}, e.g. `stdout=1&stderr=1&tail=1000`. */
export const encodeLogsQuery = (query: LogsQuery): string => {
  const parts: string[] = []
  if (query.follow) parts.push('follow=1')
  if (query.stdout) parts.push('stdout=1')
  if (query.stderr) parts.push('stderr=1')
  parts.push(`tail=${query.tail === 'all' ? 'all' : String(query.tail)}`)
  return parts.join('&')
}
