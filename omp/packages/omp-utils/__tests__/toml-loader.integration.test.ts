import * as PathModule from '@effect/platform/Path'
import { describe, expect, it } from '@effect/vitest'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { TomlLoader, TomlLoaderLive } from '../src/toml-loader.adapter.js'

const layer = (contents: Record<string, string>) =>
  TomlLoaderLive.pipe(
    Layer.provide(MemoryFileSystem.layerWith(contents)),
    Layer.provide(PathModule.layer),
  )

describe('TomlLoader', () => {
  it.effect('Should_ParseValidToml_When_FileExists', () =>
    Effect.gen(function*() {
      const loader = yield* TomlLoader
      const config = yield* loader.load('/test')
      expect(config).toEqual({ plugins: ['one', 'two'], foo: ['bar'] })
    }).pipe(
      Effect.provide(layer({ '/test/systemfsoftware.toml': 'plugins = ["one", "two"]\nfoo = ["bar"]' })),
    ))

  it.effect('Should_ReturnEmptyConfig_When_FileMissing', () =>
    Effect.gen(function*() {
      const loader = yield* TomlLoader
      const config = yield* loader.load('/empty')
      expect(config).toEqual({})
    }).pipe(Effect.provide(layer({}))))

  it.effect('Should_FailOpenAndDedupe_When_MalformedToml', () =>
    Effect.gen(function*() {
      const loader = yield* TomlLoader
      const config1 = yield* loader.load('/test')
      expect(config1).toEqual({})
      const config2 = yield* loader.load('/test')
      expect(config2).toEqual({})
    }).pipe(
      Effect.provide(layer({ '/test/systemfsoftware.toml': 'garbage [[ =\ninvalid' })),
    ))

  it.effect('Should_ReturnCachedResult_When_SameCwdLoadedAgain', () =>
    Effect.gen(function*() {
      const loader = yield* TomlLoader
      const config1 = yield* loader.load('/test')
      expect(config1).toEqual({ plugins: ['original'] })
      const config2 = yield* loader.load('/test')
      expect(config2).toEqual({ plugins: ['original'] })
    }).pipe(
      Effect.provide(layer({ '/test/systemfsoftware.toml': 'plugins = ["original"]' })),
    ))

  it.effect('Should_FailOpen_When_ShapeMismatch', () =>
    Effect.gen(function*() {
      const loader = yield* TomlLoader
      const config = yield* loader.load('/test')
      expect(config).toEqual({})
    }).pipe(
      Effect.provide(layer({ '/test/systemfsoftware.toml': 'plugins = "not-an-array"' })),
    ))
})
