import type { E2EConfigInput } from './config.schema.js'
import { type Browser, WebEngineAdapter, type WebEngineSpec } from './engine-spec.schema.js'
import type { SecretRef } from './names.schema.js'

/** Types a suite's `e2e.config.ts` default export; it returns its argument and runs nothing. */
export const defineConfig = (config: E2EConfigInput): E2EConfigInput => config

/** What `web()` takes: the browser, whether it runs headless, and headers whose values are secret refs. */
export interface WebOptions {
  readonly browser: Browser
  readonly headless?: boolean
  readonly contextHeaders?: Readonly<Record<string, SecretRef>>
}

/** The web engine as data; the composition root loads the adapter it names. */
export const web = (options: WebOptions): WebEngineSpec => ({
  _tag: 'WebEngine',
  adapter: WebEngineAdapter.literal,
  headless: true,
  contextHeaders: {},
  ...options,
})
