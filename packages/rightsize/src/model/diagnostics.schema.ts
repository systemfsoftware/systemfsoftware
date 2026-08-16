/**
 * Diagnostics schemas — the typed failure-diagnostics report (R15) as data
 * with a JSON codec, replacing upstream's string-only report. One row per
 * container this process currently has running, carrying the image, mapped
 * ports and a bounded log tail; the renderer and the live-container registry
 * land with the agent-native unit.
 */
import { Schema as S } from 'effect'
import { PortBinding } from './ports.schema.js'

/**
 * One running container's diagnostics row. `state` is always `running`: the
 * report is built from the live-container registry, never from a backend
 * query (upstream's own invariant at the fork point).
 */
export const DiagnosticsContainer = S.Struct({
  name: S.String,
  image: S.String,
  state: S.Literal('running'),
  host: S.String,
  ports: S.Array(PortBinding),
  logTailLines: S.Array(S.String),
}).pipe(
  S.annotate({
    identifier: 'DiagnosticsContainer',
    title: 'DiagnosticsContainer',
    description: 'One running container in the diagnostics report.',
  }),
)

export type DiagnosticsContainer = S.Schema.Type<typeof DiagnosticsContainer>

/**
 * The full failure report: every container this process currently has
 * running, in start order, with ports and a bounded tail of its logs.
 */
export const DiagnosticsReport = S.Struct({
  containers: S.Array(DiagnosticsContainer),
}).pipe(
  S.annotate({
    identifier: 'DiagnosticsReport',
    title: 'DiagnosticsReport',
    description: 'A typed failure-diagnostics report over running containers.',
  }),
)

export type DiagnosticsReport = S.Schema.Type<typeof DiagnosticsReport>
