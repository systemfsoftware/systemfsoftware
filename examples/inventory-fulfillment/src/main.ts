#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'
import { HttpLive } from './http/server.js'
import { AuthService } from './ports/AuthService.js'
import { PgRuntime } from './store/PgRuntime.js'

const program = HttpLive.pipe(
  Layer.provide(AuthService.Live),
  Layer.provide(PgRuntime.Live),
  Layer.orDie,
)

NodeRuntime.runMain(Layer.launch(program))
