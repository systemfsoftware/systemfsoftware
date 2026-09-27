#!/usr/bin/env node
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { runStopEnrollmentCli } from '@systemfsoftware/stop-enrollment'
import { Effect } from 'effect'

const run = await Effect.runPromise(
  runStopEnrollmentCli(process.argv.slice(2)).pipe(Effect.provide(nodeServicesLayer)),
)

for (const line of run.output) process.stdout.write(`${line}\n`)
process.exitCode = run.exitCode
