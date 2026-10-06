#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect, Layer, Logger } from 'effect'

import { runCheck } from './check.js'
import { GitLive } from './git.js'
import { selftest } from './selftest.js'

/** The guard's verdict lines, printed verbatim without Effect's default decorations. */
const plainLogger = Logger.withConsoleLog(Logger.make(({ message }) => String(message)))

const services = Layer.mergeAll(
  nodeServicesLayer,
  GitLive.pipe(Layer.provide(nodeServicesLayer)),
  Logger.layer([plainLogger]),
)

const args = process.argv.slice(2)

const selectProgram = () => (args.includes('--selftest') ? selftest : runCheck(args.includes('--write')))

const program = Effect.andThen(selectProgram(), (code) =>
  Effect.sync(() => {
    process.exitCode = code
  }))

NodeRuntime.runMain(program.pipe(Effect.provide(services)))
