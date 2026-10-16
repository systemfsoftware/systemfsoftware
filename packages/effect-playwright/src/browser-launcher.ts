import { Layer } from 'effect'
import type * as Core from 'playwright-core'
import { Browser } from './browser.service.js'
import type { PlaywrightError } from './errors.schema.js'
import { acquire } from './lift.js'

/**
 * The launched-browser driver for {@link Browser}: given a launch action such
 * as `() => chromium.launch()`, the layer acquires one browser for the layer's
 * lifetime and closes it when the layer is released.
 */
export const layer = (launch: () => Promise<Core.Browser>): Layer.Layer<Browser, PlaywrightError> =>
  Layer.effect(Browser, acquire(launch))
