import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Result from 'effect/Result'
import type { TestProject } from 'vitest/node'

import type { E2EConfigInput } from '../Config/config.schema.js'
import { clearPartials, mergePartials, type PartialsLocation } from '../report/partials.js'
import { mintRunId, RUN_ID_KEY } from './run-identity.js'
import { decodedConfigOf, type RunnerOptions } from './wiring.js'

export interface E2EGlobalSetupProject extends Pick<TestProject, 'provide'> {
  readonly config: { readonly root: string }
}

export type E2EGlobalSetupTeardown = () => Promise<void>

export type E2EGlobalSetup = (project: E2EGlobalSetupProject) => Promise<E2EGlobalSetupTeardown>

const nothingToMerge: E2EGlobalSetupTeardown = () => Promise.resolve()

const teardownFor = (location: PartialsLocation, options: RunnerOptions): E2EGlobalSetupTeardown => () =>
  mergePartials(location).pipe(Effect.asVoid, Effect.provide(options.platform), Effect.runPromise)

const setUp = (config: E2EConfigInput, options: RunnerOptions): E2EGlobalSetup => (project) =>
  Result.match(decodedConfigOf({ config, defaults: options.defaults }), {
    onFailure: () => Promise.resolve(nothingToMerge),
    onSuccess: (decoded) => {
      const location: PartialsLocation = { root: project.config.root, output: decoded.output }
      return clearPartials(location).pipe(
        Effect.andThen(Effect.sync(() => project.provide(RUN_ID_KEY, mintRunId(decoded.projectId)))),
        Effect.as(teardownFor(location, options)),
        Effect.provide(options.platform),
        Effect.runPromise,
      )
    },
  })

export const makeGlobalSetup: {
  (options: RunnerOptions): (config: E2EConfigInput) => E2EGlobalSetup
  (config: E2EConfigInput, options: RunnerOptions): E2EGlobalSetup
} = Function.dual(2, setUp)
