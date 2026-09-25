#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'
import { Auth, Http, Persistence } from './mod.js'

const application = Http.Server.HttpLive.pipe(Http.Server.supervisedApplication('inventory-fulfillment'))

const program = application.layer.pipe(
  Layer.provide(Auth.Live.layer),
  Layer.provide(Persistence.PgRuntime.PgRuntimeLive),
)

NodeRuntime.runMain(Layer.launch(program))
