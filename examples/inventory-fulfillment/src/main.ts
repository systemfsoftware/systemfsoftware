#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'
import { Auth, Http, Persistence } from './mod.js'

const program = Http.Server.HttpLive.pipe(
  Layer.provide(Auth.Live.layer),
  Layer.provide(Persistence.PgRuntime.PgRuntimeLive),
  Layer.orDie,
)

NodeRuntime.runMain(Layer.launch(program))
