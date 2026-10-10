import { providedWorkspaceRoot } from '@systemfsoftware/vitest/failure'
import { Effect, Option } from 'effect'
import { fileURLToPath } from 'node:url'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const thisFile = fileURLToPath(import.meta.url)

const defectFileAsRecordPrints = Option.match(Option.fromNullishOr(providedWorkspaceRoot()), {
  onNone: () => thisFile,
  onSome: (workspaceRoot) => thisFile.replace(`${workspaceRoot}/`, ''),
})

const defectFile = defectFileAsRecordPrints

const cause = new CorpusDefect({ defectFile, detail: 'the opening count never matched the ledger' })

export const baselineFailure: CorpusFixture = {
  name: 'a failure on the baseline run',
  defectFile,
  raisingFile: defectFile,
  program: Effect.asVoid(Effect.fail(cause)),
}
