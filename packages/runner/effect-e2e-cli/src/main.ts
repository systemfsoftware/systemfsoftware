#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node'
import * as Effect from 'effect/Effect'

import { cli } from './cli.js'

NodeRuntime.runMain(cli(new URL('../package.json', import.meta.url)).pipe(Effect.provide(NodeServices.layer)))
