import { parse } from '@std/toml'
import { Effect, Schema, SchemaIssue } from 'effect'
import * as FileSystem from 'effect/FileSystem'

import { Policy } from './Policy.schema.js'
import { EMPTY_POLICY, mergeLayers } from './merge.js'

const parsePolicyText = (text: string) =>
  Effect.try({
    try: () => parse(text),
    catch: (e) =>
      new SchemaIssue.InvalidValue({
        message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
      }),
  }).pipe(Effect.flatMap((parsed) => Schema.decodeUnknownEffect(Policy)(parsed)))

export const readLayer = (
  filePath: string,
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.exists(filePath).pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(filePath).pipe(
            Effect.flatMap(parsePolicyText),
            Effect.orElseSucceed(() => EMPTY_POLICY),
          )
          : Effect.succeed(EMPTY_POLICY)),
      Effect.orElseSucceed(() => EMPTY_POLICY),
    ))

export const readLayers = (
  filePaths: readonly string[],
): Effect.Effect<Policy, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const layers: Policy[] = []
    for (const filePath of filePaths) {
      const layer = yield* readLayer(filePath)
      layers.push(layer)
    }
    const merged = mergeLayers(layers)
    return yield* Schema.decodeEffect(Policy)(merged).pipe(Effect.orDie)
  })
