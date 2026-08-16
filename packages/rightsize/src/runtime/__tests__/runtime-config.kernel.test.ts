/**
 * Runtime config tests — the `RIGHTSIZE_*` surface read through Effect
 * `Config` against a `ConfigProvider.fromEnvRecord` map: defaults, the
 * upstream `microsandbox` alias, case-insensitive matching, typed
 * validation failures, and the service-layer composition.
 */
import { Config, ConfigProvider, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import { config, layer, RightsizeConfig } from '../config.js'

const read = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env))(Config.unwrap(config))

describe('RightsizeConfig', () => {
  it('Should_UseDefaults_When_NothingSet', () =>
    expect(Effect.runPromise(read({}))).resolves.toEqual({
      backend: 'auto',
      reaper: 'on',
      cacheDir: undefined,
      reuse: false,
      msbPath: undefined,
      msbSkipDownload: false,
    }))

  it('Should_ReadEveryField_When_Set', () =>
    expect(
      Effect.runPromise(
        read({
          RIGHTSIZE_BACKEND: 'docker',
          RIGHTSIZE_REAPER: 'sweep',
          RIGHTSIZE_CACHE_DIR: '/tmp/cache',
          RIGHTSIZE_REUSE: 'true',
          MSB_PATH: '/opt/msb',
          RIGHTSIZE_MSB_SKIP_DOWNLOAD: 'true',
        }),
      ),
    ).resolves.toEqual({
      backend: 'docker',
      reaper: 'sweep',
      cacheDir: '/tmp/cache',
      reuse: true,
      msbPath: '/opt/msb',
      msbSkipDownload: true,
    }))

  it('Should_AliasMicrosandboxToMsb_When_Set', () =>
    expect(Effect.runPromise(read({ RIGHTSIZE_BACKEND: 'microsandbox' }))).resolves.toMatchObject({
      backend: 'msb',
    }))

  it('Should_MatchBackendNameCaseInsensitively_When_SpelledDifferently', () =>
    expect(Effect.runPromise(read({ RIGHTSIZE_BACKEND: 'MicroSandbox' }))).resolves.toMatchObject({
      backend: 'msb',
    }))

  it('Should_FailTyped_When_BackendNameUnknown', () =>
    expect(Effect.runPromise(read({ RIGHTSIZE_BACKEND: 'bogus' }))).rejects.toMatchObject({
      name: 'ConfigError',
    }))

  it('Should_ResolveThroughLayer_When_Provided', () => {
    const program = Effect.map(RightsizeConfig, (service) => service.backend)
    const withProvider = Layer.provideMerge(
      layer,
      ConfigProvider.layer(Effect.succeed(ConfigProvider.fromEnvRecord({ RIGHTSIZE_BACKEND: 'msb' }))),
    )
    return expect(Effect.runPromise(Effect.provide(program, withProvider))).resolves.toBe('msb')
  })
})
