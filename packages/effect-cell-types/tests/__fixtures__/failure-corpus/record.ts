import { KernelCase } from '@systemfsoftware/effect-spec-runtime'
import { type Effect, Layer } from 'effect'

export const FIRST_LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

export interface CorpusFixture {
  readonly name: string
  readonly defectFile: string
  readonly expectedFirstLocationFile: string
  readonly program: Effect.Effect<void, Error>
}

const messageOf = (thrown: Error): string => thrown.message

export const recordOf = (fixture: CorpusFixture): Promise<string> =>
  KernelCase.explore(KernelCase.caseProgram(fixture.program, Layer.empty)).then(() => '', messageOf)
