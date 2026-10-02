import { Context, Layer } from 'effect'
import type * as Core from 'playwright-core'
import type { PlaywrightError } from './errors.schema.js'
import { acquire } from './lift.js'

export class Browser extends Context.Service<Browser, Core.Browser>()('@systemfsoftware/effect-playwright/Browser') {
  static readonly layer = (launch: () => Promise<Core.Browser>): Layer.Layer<Browser, PlaywrightError> =>
    Layer.effect(Browser, acquire(launch))
}

export class BrowserContext extends Context.Service<BrowserContext, Core.BrowserContext>()(
  '@systemfsoftware/effect-playwright/BrowserContext',
) {}

export class Page extends Context.Service<Page, Core.Page>()('@systemfsoftware/effect-playwright/Page') {}
