import { workspaceRelativePathOf } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = workspaceRelativePathOf(import.meta.url)

const cause = new CorpusDefect({ defectFile, detail: 'the opening count never matched the ledger' })

export const baselineFailure: CorpusFixture = {
  name: 'a failure on the baseline run',
  defectFile,
  raisingFile: defectFile,
  program: Effect.asVoid(Effect.fail(cause)),
}
