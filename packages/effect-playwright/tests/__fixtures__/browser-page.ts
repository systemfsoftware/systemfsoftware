import { chromium, Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

export const browserInFreshBrowser = Effect.gen(function*() {
  const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
  return yield* spawner.browser
})

export const pageInFreshBrowser = Effect.gen(function*() {
  const browser = yield* browserInFreshBrowser
  return yield* browser.newPage()
})

export const launchBrowser = Effect.gen(function*() {
  const playwright = yield* Playwright.Playwright
  return yield* playwright.launchScoped(chromium)
})
