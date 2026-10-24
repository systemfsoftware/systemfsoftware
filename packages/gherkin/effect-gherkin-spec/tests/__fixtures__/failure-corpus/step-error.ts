import { Gherkin, Given, Then } from '@systemfsoftware/effect-gherkin-spec'
import { workspaceRelativePathOf } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { StepDefect } from './corpus-defect.js'
import { Ledger } from './ledger.js'
import type { CorpusFixture } from './record.js'

const defectFile = workspaceRelativePathOf(import.meta.url)

export const stepErrorFixture: CorpusFixture = {
  name: 'a message-less error raised in a step',
  defectFile,
  raisingFile: defectFile,
}

export const stepSpec = Gherkin.Do.pipe(
  Given('a ledger the step reads before it raises')('ledger', () => Ledger),
  Given('a step that raises a message-less error')(
    'raised',
    () =>
      Effect.flatMap(Ledger, () => Effect.fail(new StepDefect({ defectFile, detail: 'the ledger never balanced' }))),
  ),
  Then('the step never asserts on the ledger')((s, expect) => expect(s.raised).toEqual('the value that never arrived')),
)
