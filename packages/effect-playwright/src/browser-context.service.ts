import { Context } from 'effect'
import type * as Core from 'playwright-core'

export const BrowserContextBase = Context.Service<BrowserContext, Core.BrowserContext>()(
  '@systemfsoftware/effect-playwright/BrowserContext',
)

export class BrowserContext extends BrowserContextBase {}
