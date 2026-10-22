#!/usr/bin/env node
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { runCli } from './cli.js'

let interrupted = false
process.on('SIGINT', () => {
  interrupted = true
})

const code = await Effect.runPromise(
  runCli(process.argv.slice(2), { env: process.env, interrupted: () => interrupted }).pipe(
    Effect.provide(nodeServicesLayer),
  ),
)
process.exit(code)
