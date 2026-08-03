import * as FileSystem from '@effect/platform/FileSystem'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import { make } from './index.js'

export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(
  FileSystem.FileSystem,
  Effect.sync(() => make()),
)
