import { Context } from 'effect'
import type * as Core from 'playwright-core'

export const PageBase = Context.Service<Page, Core.Page>()('@systemfsoftware/effect-playwright/Page')

export class Page extends PageBase {}
