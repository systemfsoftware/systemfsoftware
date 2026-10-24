import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as DopplerOidc from '../src/DopplerOidc.js'
import * as GithubAppTokenMinter from '../src/GithubAppTokenMinter.js'
import * as GithubPackagesApi from '../src/GithubPackagesApi.js'
import * as NodePnpm from '../src/NodePnpm.js'
import { registryGate } from '../src/registry-gate.program.js'

const live = Layer.mergeAll(GithubAppTokenMinter.layer, GithubPackagesApi.layer, NodePnpm.layer).pipe(
  Layer.provideMerge(DopplerOidc.layer),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
)

NodeRuntime.runMain(registryGate.pipe(Effect.provide(live)))
