import type { FailureRecord, RecordedRun } from '@systemfsoftware/vitest/failure'
import { Option } from 'effect'

export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

export interface CorpusFixture<E> {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string | undefined
  readonly program: RecordedRun<void, E>
}

export interface VerdictInput<E> {
  readonly record: FailureRecord | undefined
  readonly fixture: CorpusFixture<E>
  readonly cause: string | undefined
}

export interface CorpusVerdict {
  readonly name: string
  readonly namesDefectFile: boolean
  readonly hasHeadline: boolean
  readonly hasCauseChain: boolean
  readonly firstLocation: string | undefined
  readonly firstLocationFile: string | undefined
  readonly breaches: ReadonlyArray<string>
  readonly carriesCause: boolean
}

const fileOf = (location: string | undefined): string | undefined => location?.replace(/:\d+$/u, '')

const verdictOf = <E>(record: FailureRecord, fixture: CorpusFixture<E>, cause: string | undefined): CorpusVerdict => {
  const first = FIRST_LOCATION.exec(record.record)?.[0]
  return {
    name: record.name,
    namesDefectFile: record.record.includes(fixture.defectFile),
    hasHeadline: record.name.length > 0 && record.record.startsWith(`${record.name}: `),
    hasCauseChain: record.record.includes('Cause chain:'),
    firstLocation: first,
    firstLocationFile: fileOf(first),
    breaches: record.breaches,
    carriesCause: cause === undefined || record.record.includes(cause),
  }
}

export const verdictOrNull = <E>({ record, fixture, cause }: VerdictInput<E>): CorpusVerdict | null =>
  Option.getOrNull(Option.map(Option.fromNullishOr(record), (present) => verdictOf(present, fixture, cause)))
