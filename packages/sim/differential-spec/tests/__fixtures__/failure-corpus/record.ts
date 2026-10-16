import type { FailureRecord, RecordedRun } from '@systemfsoftware/vitest/failure'
import { Option } from 'effect'

export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

const SEED = /\bseed:? ?-?\d+/u
const PATH = /\bpath "/u
const REPRODUCTION = /fc\.check\(property/u

export interface CorpusFixture<E> {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string | undefined
  readonly program: RecordedRun<void, E>
}

export interface VerdictInput<E> {
  readonly record: FailureRecord | undefined
  readonly fixture: CorpusFixture<E>
}

export interface CorpusVerdict {
  readonly name: string
  readonly namesDefectFile: boolean
  readonly hasHeadline: boolean
  readonly carriesDisparity: boolean
  readonly hasSeed: boolean
  readonly hasPath: boolean
  readonly hasReproduction: boolean
  readonly firstLocation: string | undefined
  readonly firstLocationFile: string | undefined
  readonly breaches: ReadonlyArray<string>
}

const fileOf = (location: string | undefined): string | undefined => location?.replace(/:\d+$/u, '')

const verdictOf = <E>(record: FailureRecord, fixture: CorpusFixture<E>): CorpusVerdict => {
  const first = FIRST_LOCATION.exec(record.record)?.[0]
  return {
    name: record.name,
    namesDefectFile: record.record.includes(fixture.defectFile),
    hasHeadline: record.name.length > 0 && record.record.startsWith(`${record.name}: `),
    carriesDisparity: record.record.includes('Differential test failed!'),
    hasSeed: SEED.test(record.record),
    hasPath: PATH.test(record.record),
    hasReproduction: REPRODUCTION.test(record.record),
    firstLocation: first,
    firstLocationFile: fileOf(first),
    breaches: record.breaches,
  }
}

export const verdictOrNull = <E>({ record, fixture }: VerdictInput<E>): CorpusVerdict | null =>
  Option.getOrNull(Option.map(Option.fromNullishOr(record), (present) => verdictOf(present, fixture)))
