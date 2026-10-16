import { workspaceRelativePathOf } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = workspaceRelativePathOf(import.meta.url)

const cause = new CorpusDefect({ defectFile, detail: 'the clerk dropped the basket' })

export const raisedInUserCode: CorpusFixture = {
  name: 'a failure raised in user code',
  defectFile,
  raisingFile: defectFile,
  program: Effect.asVoid(Effect.fail(cause)),
}
