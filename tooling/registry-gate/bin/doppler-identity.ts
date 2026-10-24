import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { provisionDopplerIdentity } from '../src/doppler-identity.program.js'

const live = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)

NodeRuntime.runMain(provisionDopplerIdentity.pipe(Effect.provide(live)))
