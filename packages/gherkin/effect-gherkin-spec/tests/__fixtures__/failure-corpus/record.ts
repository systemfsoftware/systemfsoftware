export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

export interface CorpusFixture {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string
}
