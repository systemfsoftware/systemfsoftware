import { Array as Arr, Match, Schema } from 'effect'
import { PatternStatus } from './Verdict.schema.js'

export const EvalMetrics = Schema.Struct({
  total: Schema.Finite,
  decided: Schema.Finite,
  uncertain: Schema.Finite,
  coverage: Schema.Finite,
  correct: Schema.Finite,
  accuracy: Schema.Finite,
  selectiveAccuracy: Schema.Finite,
  truePositive: Schema.Finite,
  falsePositive: Schema.Finite,
  trueNegative: Schema.Finite,
  falseNegative: Schema.Finite,
  precision: Schema.Finite,
  recall: Schema.Finite,
  f1: Schema.Finite,
})
export type EvalMetrics = typeof EvalMetrics.Type

export const EvalRecord = Schema.Struct({
  input: Schema.Json,
  expected: Schema.Boolean,
  status: PatternStatus,
})
export type EvalRecord = typeof EvalRecord.Type

export const EvalReport = Schema.Struct({
  metrics: EvalMetrics,
  records: Schema.Array(EvalRecord),
})
export type EvalReport = typeof EvalReport.Type

interface Tally {
  readonly uncertain: number
  readonly correct: number
  readonly truePositive: number
  readonly falsePositive: number
  readonly trueNegative: number
  readonly falseNegative: number
}

const emptyTally: Tally = {
  uncertain: 0,
  correct: 0,
  truePositive: 0,
  falsePositive: 0,
  trueNegative: 0,
  falseNegative: 0,
}

const matchTallyOf = (tally: Tally, expected: boolean): Tally =>
  Match.value(expected).pipe(
    Match.when(true, () => ({ ...tally, correct: tally.correct + 1, truePositive: tally.truePositive + 1 })),
    Match.when(false, () => ({ ...tally, falsePositive: tally.falsePositive + 1 })),
    Match.exhaustive,
  )

const missTallyOf = (tally: Tally, expected: boolean): Tally =>
  Match.value(expected).pipe(
    Match.when(true, () => ({ ...tally, falseNegative: tally.falseNegative + 1 })),
    Match.when(false, () => ({ ...tally, correct: tally.correct + 1, trueNegative: tally.trueNegative + 1 })),
    Match.exhaustive,
  )

const stepTally = (tally: Tally, record: EvalRecord): Tally =>
  Match.value(record.status).pipe(
    Match.when('Uncertain', () => ({ ...tally, uncertain: tally.uncertain + 1 })),
    Match.when('Match', () => matchTallyOf(tally, record.expected)),
    Match.when('Miss', () => missTallyOf(tally, record.expected)),
    Match.exhaustive,
  )

const ratioOf = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole)

/** The reference metrics: coverage, accuracy, selective accuracy, precision, recall, f1. */
export const metricsOf = (records: ReadonlyArray<EvalRecord>): EvalMetrics => {
  const tally = Arr.reduce(records, emptyTally, stepTally)
  const total = records.length
  const decided = total - tally.uncertain
  const precision = ratioOf(tally.truePositive, tally.truePositive + tally.falsePositive)
  const recall = ratioOf(tally.truePositive, tally.truePositive + tally.falseNegative)
  return EvalMetrics.make({
    total,
    decided,
    uncertain: tally.uncertain,
    coverage: ratioOf(decided, total),
    correct: tally.correct,
    accuracy: ratioOf(tally.correct, total),
    selectiveAccuracy: ratioOf(tally.correct, decided),
    truePositive: tally.truePositive,
    falsePositive: tally.falsePositive,
    trueNegative: tally.trueNegative,
    falseNegative: tally.falseNegative,
    precision,
    recall,
    f1: ratioOf(2 * precision * recall, precision + recall),
  })
}
if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const uncertainRecordCount = (records: ReadonlyArray<EvalRecord>): number =>
    Arr.filter(records, (record) => record.status === 'Uncertain').length

  const ratioFieldsOf = (metrics: EvalMetrics): ReadonlyArray<number> => [
    metrics.coverage,
    metrics.accuracy,
    metrics.selectiveAccuracy,
    metrics.precision,
    metrics.recall,
    metrics.f1,
  ]

  const inUnitInterval = (ratio: number): boolean => ratio >= 0 && ratio <= 1

  it.prop(
    '∀r_Decided_=TotalMinusUncertain',
    { of: [Schema.Array(EvalRecord)], subject: metricsOf },
    (subject, [records]) => {
      const metrics = subject(records)
      return metrics.decided + metrics.uncertain === metrics.total
    },
  )

  it.prop(
    '∀r_Cells_=TotalCells',
    { of: [Schema.Array(EvalRecord)], subject: metricsOf },
    (subject, [records]) => {
      const metrics = subject(records)
      return metrics.truePositive + metrics.falsePositive + metrics.trueNegative + metrics.falseNegative +
          metrics.uncertain === metrics.total
    },
  )

  it.prop(
    '∀r_Uncertain_=RecordCount',
    { of: [Schema.Array(EvalRecord)], subject: metricsOf },
    (subject, [records]) => subject(records).uncertain === uncertainRecordCount(records),
  )

  it.prop(
    '∀x_Ratios_∈UnitInterval',
    { of: [Schema.Array(EvalRecord)], subject: metricsOf },
    (subject, [records]) => Arr.every(ratioFieldsOf(subject(records)), inUnitInterval),
  )
}
