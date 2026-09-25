import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { type Effect, Layer } from 'effect'
import type { CorpusDefect } from './defect-error.js'

export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

export interface CorpusFixture {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string | undefined
  readonly program: Effect.Effect<void, CorpusDefect>
}

const messageOf = (thrown: Error): string => thrown.message

export const recordOf = (fixture: CorpusFixture): Promise<string> =>
  KernelCase.explore(KernelCase.caseProgram(fixture.program, Layer.empty)).then(() => '', messageOf)
