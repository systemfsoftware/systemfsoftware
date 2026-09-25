import { Effect } from 'effect'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-spec-runtime/tests/__fixtures__/failure-corpus/baseline-failure.ts'

const cause = new CorpusDefect({ defectFile, detail: 'the opening count never matched the ledger' })

export const baselineFailure: CorpusFixture = {
  name: 'a failure on the baseline run',
  defectFile,
  raisingFile: defectFile,
  program: Effect.asVoid(Effect.fail(cause)),
}
