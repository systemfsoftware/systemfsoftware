#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { runCheck } from './check.js'
import { selftest } from './selftest.js'

const args = process.argv.slice(2)
const program = Effect.andThen(
  args.includes('--selftest') ? selftest : runCheck(args.includes('--write')),
  (code) => Effect.sync(() => {
    process.exitCode = code
  }),
)

NodeRuntime.runMain(program.pipe(Effect.provide(nodeServicesLayer)))
