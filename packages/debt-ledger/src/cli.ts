#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { run } from './run.js'

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

const dir = Flag.Directory('dir', { mustExist: true }).pipe(
  Flag.withDescription('Repository root to scan; defaults to the working directory.'),
  Flag.withDefault('.'),
)

const build = Command.make('build', { dir }, ({ dir }) => report(dir, false)).pipe(
  Command.withDescription('Write docs/debt.md and docs/debt.json from the source.'),
)

const check = Command.make('check', { dir }, ({ dir }) => report(dir, true)).pipe(
  Command.withDescription('Fail on an undeclared entry or when the committed ledger differs from a fresh build.'),
)

const debtLedger = Command.make('debt-ledger').pipe(Command.withSubcommands([build, check]))

NodeRuntime.runMain(Command.run(debtLedger, { version: '0.0.0' }).pipe(Effect.provide(nodeServicesLayer)))
