#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect, Option } from 'effect'
import { run } from './run.js'

const dirOf = (argv: ReadonlyArray<string>): string | undefined => {
  const inline = argv.find((arg) => arg.startsWith('--dir='))
  return Option.getOrUndefined(Option.map(Option.fromNullishOr(inline), (arg) => arg.slice('--dir='.length)))
}

const program = (dir: string, check: boolean) =>
  Effect.gen(function*() {
    const { result } = yield* run(dir, check)
    yield* Effect.log(
      `debt-ledger: scanned ${result.ledger.fileCount} files across channels: ${
        result.ledger.scannedChannels.join(', ')
      }`,
    )
    return result
  })

const report = (dir: string, check: boolean) =>
  program(dir, check).pipe(
    Effect.tapError((error) => Effect.logError(error.message)),
    Effect.catch(() =>
      Effect.sync(() => {
        process.exitCode = 1
      })
    ),
  )

const argv = process.argv.slice(2)

NodeRuntime.runMain(Effect.provide(report(dirOf(argv) ?? process.cwd(), argv[0] === 'check'), nodeServicesLayer))
