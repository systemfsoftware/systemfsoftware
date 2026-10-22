import { defineConfig, type E2EConfigInput, web, type WebEngineSpec } from '@systemfsoftware/effect-e2e'
import { describe, expect, it } from 'tstyche'

const target = {
  name: 'web',
  engine: web({ browser: 'chromium' }),
  app: { url: 'https://staging.acme.test', identity: 'acme-web' },
}

describe('defineConfig', () => {
  it('is the identity over the config input', () => {
    expect(defineConfig).type.toBe<(config: E2EConfigInput) => E2EConfigInput>()
  })

  it('refuses a config literal with an unknown key', () => {
    expect(defineConfig).type.not.toBeCallableWith({ targets: [target], retry: 2 })
  })

  it('refuses a config without targets', () => {
    expect(defineConfig).type.not.toBeCallableWith({ projectId: 'acme.web' })
  })
})

describe('web', () => {
  it('returns the web engine spec', () => {
    expect(web({ browser: 'chromium' })).type.toBe<WebEngineSpec>()
  })

  it('refuses a browser the engine does not drive', () => {
    expect(web).type.not.toBeCallableWith({ browser: 'edge' })
  })
})
