import { NodeServices } from '@effect/platform-node'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'

import { POOL_IDS, SUITE_OUTPUT } from './site.js'

export const recordPoolSlot = (): Promise<void> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const slot = yield* Config.String('VITEST_POOL_ID')
    yield* fs.makeDirectory(SUITE_OUTPUT, { recursive: true })
    yield* fs.writeFileString(POOL_IDS, `${slot}\n`, { flag: 'a' })
  }).pipe(Effect.orDie, Effect.provide(NodeServices.layer), Effect.runPromise)

export const distinctPoolIds = (recorded: string): ReadonlyArray<number> =>
  [...new Set(recorded.trim().split('\n').map(Number))].toSorted((left, right) => left - right)
