import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'

import { EMPTY_POLICY, mergeLayers } from './merge.js'
import { Policy, PolicyFromToml } from './Policy.schema.js'

export const readLayer = (
  filePath: string,
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFileString(filePath).pipe(
      Effect.flatMap(Schema.decodeEffect(PolicyFromToml)),
      Effect.orElseSucceed(() => EMPTY_POLICY),
    ))

export const readLayers = (
  filePaths: readonly string[],
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.all(filePaths.map(readLayer), { concurrency: 'unbounded' }).pipe(
    Effect.map(mergeLayers),
    Effect.flatMap(Schema.decodeEffect(Policy)),
    Effect.orDie,
  )
