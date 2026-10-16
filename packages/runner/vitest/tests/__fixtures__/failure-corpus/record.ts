import type { FailureRecord, RecordedRun } from '@systemfsoftware/vitest/failure'
import type { CorpusDefect } from './defect-error.js'

export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

const SEED = /\bseed=-?\d+/u
const PATH = /\bpath=\d+(?:,\d+)*/u
const RERUN = /Rerun only this scenario:/u

export interface CorpusFixture {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string | undefined
  readonly program: RecordedRun<void, CorpusDefect>
}

export interface CorpusVerdict {
  readonly name: string
  readonly defectFile: string
  readonly namesDefectFile: boolean
  readonly firstLocation: string | undefined
  readonly firstLocationFile: string | undefined
  readonly hasSeed: boolean
  readonly hasPath: boolean
  readonly hasRerun: boolean
}

export interface VerdictInput {
  readonly record: FailureRecord
  readonly fixture: CorpusFixture
}

export interface ReplayVerdict {
  readonly name: string
  readonly hasSeed: boolean
  readonly hasPath: boolean
  readonly hasRerun: boolean
}

export const replayVerdictOf = (record: FailureRecord): ReplayVerdict => ({
  name: record.name,
  hasSeed: SEED.test(record.record),
  hasPath: PATH.test(record.record),
  hasRerun: RERUN.test(record.record),
})

const fileOf = (location: string | undefined): string | undefined => location?.replace(/:\d+$/u, '')

export const verdictOf = ({ record, fixture }: VerdictInput): CorpusVerdict => {
  const first = FIRST_LOCATION.exec(record.record)?.[0]
  return {
    name: record.name,
    defectFile: fixture.defectFile,
    namesDefectFile: record.record.includes(fixture.defectFile),
    firstLocation: first,
    firstLocationFile: fileOf(first),
    hasSeed: SEED.test(record.record),
    hasPath: PATH.test(record.record),
    hasRerun: RERUN.test(record.record),
  }
}
