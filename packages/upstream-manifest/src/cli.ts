#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect, Layer, Logger } from 'effect'

import { runCheck } from './check.js'
import { GitLive, runGit } from './git.js'
import { reportPaths } from './manifest.js'
import { selftest } from './selftest.js'

/** The guard's verdict lines, printed verbatim without Effect's default decorations. */
const plainLogger = Logger.withConsoleLog(Logger.make(({ message }) => String(message)))

const services = Layer.mergeAll(
  nodeServicesLayer,
  GitLive.pipe(Layer.provide(nodeServicesLayer)),
  Logger.layer([plainLogger]),
)

const args = process.argv.slice(2)

/**
 * Every path the guard reads — the tracked tree, `dprint.json`, the manifests, the
 * reports — is repository-relative, so the CLI grades from the repository root
 * however deep in the tree a package-scoped task invoked it.
 */
const atRepositoryRoot = Effect.gen(function*() {
  const toplevel = yield* runGit({ args: ['rev-parse', '--show-toplevel'] })
  yield* Effect.sync(() => process.chdir(toplevel.trim()))
})

const selectProgram = () =>
  args.includes('--selftest') ? selftest : runCheck(args.includes('--write'), reportPaths(args))

const program = Effect.andThen(atRepositoryRoot, selectProgram).pipe(
  Effect.andThen((code) =>
    Effect.sync(() => {
      process.exitCode = code
    })
  ),
)

NodeRuntime.runMain(program.pipe(Effect.provide(services)))
