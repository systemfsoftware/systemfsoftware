#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { Command, Flag } from 'effect/cli'
import { build } from './build.js'
import { check } from './check.js'
import type { DiagramReport } from './report.js'

const logReport = (report: DiagramReport) =>
  Effect.forEach(
    report.messages,
    (message) => report.exitCode === 0 ? Effect.log(message) : Effect.logError(message),
    { discard: true },
  ).pipe(Effect.andThen(Effect.sync(() => {
    process.exitCode = report.exitCode
  })))

const dir = Flag.Directory('dir', { mustExist: true }).pipe(
  Flag.withDescription('Directory holding transition-diagram.config.ts; defaults to the working directory.'),
  Flag.withDefault('.'),
)

const buildCommand = Command.make('build', { dir }, ({ dir }) => Effect.tap(build({ cwd: dir }), logReport)).pipe(
  Command.withDescription('Render every configured machine and workflow and write the diagrams.'),
)

const checkCommand = Command.make('check', { dir }, ({ dir }) => Effect.tap(check({ cwd: dir }), logReport)).pipe(
  Command.withDescription('Fail when a committed diagram is stale, missing or orphaned.'),
)

const transitionDiagram = Command.make('transition-diagram').pipe(
  Command.withSubcommands([buildCommand, checkCommand]),
)

NodeRuntime.runMain(Command.run(transitionDiagram, { version: '0.0.0' }).pipe(Effect.provide(nodeServicesLayer)))
