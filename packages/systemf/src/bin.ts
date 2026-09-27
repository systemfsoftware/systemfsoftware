#!/usr/bin/env node
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { runSystemf } from '@systemfsoftware/systemf'
import { Effect } from 'effect'

const run = await Effect.runPromise(runSystemf(process.argv.slice(2)).pipe(Effect.provide(nodeServicesLayer)))
for (const line of run.stdout) {
  process.stdout.write(`${line}\n`)
}
process.exitCode = run.exitCode
