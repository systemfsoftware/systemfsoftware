/**
 * Container label scheme for the docker backend — reaping and reuse labels
 * (behavioral reference: upstream rightsize-node
 * `src/backend-docker/labels.ts` at the fork point, Apache-2.0).
 *
 * Every non-`keepAlive` container this backend creates carries
 * `dev.rightsize.runId=<runId>` so `close()`-style own-run cleanup and any
 * other run's label-scoped sweep can find exactly this run's containers
 * without touching anyone else's. A `keepAlive` (reuse) container carries
 * `dev.rightsize.reuse=<12hex>` INSTEAD — never the run-id label — so reuse
 * containers are structurally invisible to run-scoped removal and survive
 * their creating run's normal-exit cleanup.
 *
 * The literal wire-format keys are part of the library's external contract:
 * the hygiene ledger, the reaper sweep, and the watchdog filter on these
 * strings across processes and releases, so they are declared here as
 * constants, never inline.
 *
 * Everything in this module is pure data in → data out; nothing touches the
 * daemon.
 *
 * @since 0.1.0
 */
import { createHash } from 'node:crypto'

/** The label key every non-`keepAlive` container carries: `dev.rightsize.runId`. */
export const RUN_ID_LABEL_KEY = 'dev.rightsize.runId'

/** The label key a `keepAlive` (reuse) container carries instead of `RUN_ID_LABEL_KEY`. */
export const REUSE_LABEL_KEY = 'dev.rightsize.reuse'

/**
 * The `filters` query-string value for `GET /containers/json?filters=…`,
 * scoped to one run id's label.
 */
export const labelFilterQuery = (runId: string): string => JSON.stringify({ label: [`${RUN_ID_LABEL_KEY}=${runId}`] })

/** First 12 hex characters of `name`'s sha256 — the `<12hex>` reuse-label value format. */
const reuseLabelValue = (name: string): string => createHash('sha256').update(name).digest('hex').slice(0, 12)

/**
 * The `Labels` a container gets at `POST /containers/create` time: the
 * run-id label for a normal container, or — for a `keepAlive` (reuse)
 * container — `REUSE_LABEL_KEY=<12hex>` instead, never both.
 */
export const containerLabels = (spec: {
  readonly keepAlive: boolean
  readonly runId: string
  readonly name: string
}): Record<string, string> => {
  if (spec.keepAlive) {
    return { [REUSE_LABEL_KEY]: reuseLabelValue(spec.name) }
  }
  return { [RUN_ID_LABEL_KEY]: spec.runId }
}
