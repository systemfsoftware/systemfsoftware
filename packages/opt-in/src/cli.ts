#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { parseArgs } from './cliArgs.js'
import { runSync } from './syncCommand.js'

const parsed = parseArgs(process.argv.slice(2))

const program = runSync({ dir: parsed.dir ?? process.cwd(), check: parsed.check })

const report = Effect.tap(
  program,
  (result) =>
    Effect.forEach(result.messages, (message) => Effect.logError(message), { discard: true }).pipe(
      Effect.andThen(Effect.sync(() => {
        process.exitCode = result.exitCode
      })),
    ),
)

NodeRuntime.runMain(Effect.provide(report, nodeServicesLayer))
