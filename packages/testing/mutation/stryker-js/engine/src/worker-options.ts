import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'

import { WorkerOptionsWire } from './worker-options.schema.js'

export const encodeWorkerOptions = (options: StrykerOptions): Effect.Effect<string> =>
  S.encodeEffect(WorkerOptionsWire)(options).pipe(Effect.orDie)

export const decodeWorkerOptions = (raw: string) => S.decodeUnknownEffect(WorkerOptionsWire)(raw)
