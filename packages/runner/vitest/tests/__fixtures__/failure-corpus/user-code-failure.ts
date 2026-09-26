import { Effect } from 'effect'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/runner/vitest/tests/__fixtures__/failure-corpus/user-code-failure.ts'

const cause = new CorpusDefect({ defectFile, detail: 'the clerk dropped the basket outside the runner' })

export const userCodeFailure: CorpusFixture = {
  name: 'a failure raised in user code',
  defectFile,
  raisingFile: defectFile,
  program: () => Effect.asVoid(Effect.fail(cause)),
}
