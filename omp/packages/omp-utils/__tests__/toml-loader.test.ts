import * as PathModule from '@effect/platform/Path'
import { describe, expect, it } from '@effect/vitest'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { beforeEach } from 'vitest'
import { loadToml, resetTomlCache } from '../src/toml-loader.kernel.js'

const provide = (contents: Record<string, string>) =>
  Effect.provide(
    MemoryFileSystem.layerWith(contents).pipe(Layer.provideMerge(PathModule.layer)),
  )

describe('loadToml', () => {
  beforeEach(() => {
    Effect.runSync(resetTomlCache)
  })

  it.effect('Should_ParseValidToml_When_FileExists', () =>
    Effect.gen(function*() {
      const config = yield* loadToml('/test')
      expect(config).toEqual({ plugins: ['one', 'two'], foo: ['bar'] })
    }).pipe(
      provide({ '/test/systemfsoftware.toml': 'plugins = ["one", "two"]\nfoo = ["bar"]' }),
    ))

  it.effect('Should_ReturnEmptyObject_When_FileMissing', () =>
    Effect.gen(function*() {
      const config = yield* loadToml('/empty')
      expect(config).toEqual({})
    }).pipe(provide({})))

  it.effect('Should_FailOpen_When_MalformedToml', () =>
    Effect.gen(function*() {
      const config1 = yield* loadToml('/test')
      expect(config1).toEqual({})

      const config2 = yield* loadToml('/test')
      expect(config2).toEqual({})
    }).pipe(provide({ '/test/systemfsoftware.toml': 'garbage [[ =\ninvalid' })))

  it.effect('Should_ReturnCachedResult_When_SameCwdLoadedAgain', () =>
    Effect.gen(function*() {
      const config1 = yield* loadToml('/test')
      expect(config1).toEqual({ plugins: ['original'] })

      const config2 = yield* loadToml('/test')
      expect(config2).toEqual({ plugins: ['original'] })
    }).pipe(provide({ '/test/systemfsoftware.toml': 'plugins = ["original"]' })))
})
