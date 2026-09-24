import { Metamorphic } from '@systemfsoftware/differential-spec'
import { observed, programs, unbatched } from './__fixtures__/registry-program.fixture.js'

const mirrorRead = 'read 6:'

const heardLines = (log: ReadonlyArray<string>): ReadonlyArray<string> =>
  log.filter((line) => line.startsWith('heard '))

/**
 * Values that only writes decide. The mirror is written by a listener, and a
 * listener runs after the batch that woke it, so a mirror read inside a batch
 * rightly differs from the same read in the split program.
 */
const writeDecidedReads = (log: ReadonlyArray<string>): ReadonlyArray<string> =>
  log.filter((line) => line.startsWith('read ') && !line.startsWith(mirrorRead))

Metamorphic.on(observed)
  .relation({
    transformInput: unbatched,
    assertOutput: (batched, split) => {
      const expected = writeDecidedReads(batched)
      const actual = writeDecidedReads(split)
      return expected.length === actual.length && expected.every((line, index) => line === actual[index])
    },
  })
  .on(programs, { runBudget: 500 })

Metamorphic.on(observed)
  .relation({
    transformInput: unbatched,
    assertOutput: (batched, split) => heardLines(batched).length <= heardLines(split).length,
  })
  .on(programs, { runBudget: 500 })
