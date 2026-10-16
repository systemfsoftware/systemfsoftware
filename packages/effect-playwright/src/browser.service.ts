import { Context } from 'effect'
import type * as Core from 'playwright-core'

export const BrowserBase = Context.Service<Browser, Core.Browser>()('@systemfsoftware/effect-playwright/Browser')

export class Browser extends BrowserBase {}
