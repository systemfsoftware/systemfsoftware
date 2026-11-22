import { Effect } from 'effect'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { startVitest } from 'vitest/node'
import { ProbeFailure } from './run-fixtures'

const replayConfigRoot = fileURLToPath(new URL('./replay-config/', import.meta.url))

const runOutputOf = async (file: string): Promise<string> => {
  const chunks: Array<string> = []
  const sink = new Writable({
    write: (chunk, _encoding, done) => {
      chunks.push(String(chunk))
      done()
    },
  })
  const vitest = await startVitest(
    'test',
    [file],
    { root: replayConfigRoot, run: true, watch: false, reporters: [] },
    {},
    { stdout: sink, stderr: sink },
  )
  await vitest.close()
  return chunks.join('')
}

/** Everything a Vitest run printed, run from the replay-config fixture directory so its config file is loaded. */
export const replayRunOutput = (file: string): Effect.Effect<string, ProbeFailure> =>
  Effect.tryPromise({
    try: () => runOutputOf(file),
    catch: (cause) => new ProbeFailure({ stage: 'run', detail: `replay-config: ${file} did not run`, cause }),
  })
