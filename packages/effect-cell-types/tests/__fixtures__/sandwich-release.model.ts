import { dual } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'

/**
 * The desk the interruption-release check judges: one named admission door
 * per flavour of order, all settling into one shared duration book.
 */
export interface RecordedLedger {
  readonly registry: Layer.Layer<never, never, never>
}

const bookOf = (): Metric.MetricRegistry => new Map()

export const recordedLedger = (): RecordedLedger => ({
  registry: Layer.succeed(Metric.MetricRegistry, bookOf()),
})

/** Why the probe refuses: a run closed without settling its result class. */
export interface UnsettledRun {
  readonly reason: string
}

const classOf = (attributes: Metric.Metric.AttributeSet | undefined): string =>
  attributes === undefined || typeof attributes['result_class'] !== 'string' ? 'missing' : attributes['result_class']

/** The exact result class each closed run in the book carries, in run order. */
export const recordedClassesOf: {
  (snapshots: ReadonlyArray<Metric.Metric.Snapshot>, name: string): ReadonlyArray<string>
  (name: string): (snapshots: ReadonlyArray<Metric.Metric.Snapshot>) => ReadonlyArray<string>
} = dual(
  2,
  (snapshots: ReadonlyArray<Metric.Metric.Snapshot>, name: string): ReadonlyArray<string> =>
    snapshots.flatMap((snapshot) =>
      snapshot.type === 'Histogram' && snapshot.id === `app.${name}.duration` ? [classOf(snapshot.attributes)] : []
    ),
)
