import { acquire, Browser, chromium } from '@systemfsoftware/effect-playwright'
import { Effect, Layer } from 'effect'

export const sharedBrowserLayer = Browser.layer(() => chromium.launch()).pipe(Layer.orDie)

export const newPage = Effect.flatMap(Effect.service(Browser), (browser) => acquire(() => browser.newPage()))

export const ownBrowser = acquire(() => chromium.launch())
