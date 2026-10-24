#!/usr/bin/env bun
import { BunRuntime, BunServices } from '@effect/platform-bun'
import { Effect } from 'effect'
import { main } from '../src/cli.ts'

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)))
