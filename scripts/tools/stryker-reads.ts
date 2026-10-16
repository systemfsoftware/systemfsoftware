// stryker-reads.ts - the config files the installed Stryker reads in the current directory, in the order it reads
// them, by its own config reader (`Configuration.readConfig`, as `stryker run` calls it): it reads one, that file is
// removed, and it reads again, until it loads none. Each file is named by the `concurrency` it sets; the first
// argument maps each such number to its file name, as JSON. Prints one JSON array of file names.
//
// mutation-probe.contract.test.ts runs it in its own process, since loading Stryker needs `--allow-sys`.
import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Configuration } from '@systemfsoftware/stryker-js'
import { Effect, Layer, Result } from 'effect'

const nameOf: Readonly<Record<string, string>> = JSON.parse(Deno.args[0] ?? '{}')

/** The file Stryker reads here, or null when it loads none (no config file, or one it refuses). */
const read = async (): Promise<string | null> =>
  Result.match(
    await Effect.runPromise(
      Effect.result(Configuration.readConfig({}, { command: 'run', mode: 'machine' })).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
    ),
    { onSuccess: (options) => nameOf[String(options.concurrency)] ?? null, onFailure: () => null },
  )

const order: string[] = []
for (let name = await read(); name !== null; name = await read()) {
  order.push(name)
  await Deno.remove(name)
}
console.log(JSON.stringify(order))
