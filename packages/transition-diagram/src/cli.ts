#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { build } from './build.js'
import { check } from './check.js'
import { parseArgs } from './cliArgs.js'
import type { DiagramReport } from './report.js'

const options = parseArgs(process.argv.slice(2))
const cwd = options.dir ?? process.cwd()
const program = options.command === 'check' ? check({ cwd }) : build({ cwd })

const logReport = (report: DiagramReport) =>
  Effect.forEach(
    report.messages,
    (message) => report.exitCode === 0 ? Effect.log(message) : Effect.logError(message),
    { discard: true },
  ).pipe(Effect.andThen(Effect.sync(() => {
    process.exitCode = report.exitCode
  })))

NodeRuntime.runMain(Effect.provide(Effect.tap(program, logReport), nodeServicesLayer))
