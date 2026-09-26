import { Effect } from 'effect'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-spec-runtime/tests/__fixtures__/failure-corpus/raised-in-user-code.ts'

const cause = new CorpusDefect({ defectFile, detail: 'the clerk dropped the basket' })

export const raisedInUserCode: CorpusFixture = {
  name: 'a failure raised in user code',
  defectFile,
  raisingFile: defectFile,
  program: Effect.asVoid(Effect.fail(cause)),
}
