import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'

const Feature = makeFeature({ it })

const openPage = Effect.gen(function*() {
  const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
  const browser = yield* spawner.browser
  return yield* browser.newPage()
})

const blankPage = () => openPage.pipe(Effect.tap((page) => page.goto('about:blank')))

Feature('Emulating media and viewport in a live page')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('an emulated colour scheme and viewport are observable in a real rendering engine')
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'The page reports a <scheme> colour scheme it was given',
      [
        { scheme: 'dark', reported: true },
        { scheme: 'light', reported: false },
      ],
      ({ scheme, reported }) =>
        Gherkin.Do.pipe(
          Given('a page on a blank document')('page', blankPage),
          When(`the ${scheme} colour scheme is emulated`)((s) => s.page.emulateMedia({ colorScheme: scheme })),
          When('the page reports its preferred colour scheme')('isDark', (s) =>
            s.page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)),
          Then('the report matches the emulated scheme')((s, expect) =>
            expect({ isDark: s.isDark }).toEqual({ isDark: reported })
          ),
        ),
    )

    scenario(
      'Setting the viewport resizes the page inner dimensions',
      Gherkin.Do.pipe(
        Given('a page on a blank document')('page', blankPage),
        When('the viewport is set to 600 by 400')((s) => s.page.setViewportSize({ width: 600, height: 400 })),
        When('the page reports its inner dimensions')(
          'inner',
          (s) => s.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
        ),
        Then('the page is 600 pixels wide and 400 pixels tall')((s, expect) =>
          expect(s.inner).toEqual({ width: 600, height: 400 })
        ),
      ),
    )

    scenario(
      'The viewport size is readable once it has been set',
      Gherkin.Do.pipe(
        Given('a page on a blank document')('page', blankPage),
        When('the viewport is set to 600 by 400')((s) => s.page.setViewportSize({ width: 600, height: 400 })),
        When('the reported viewport size is read')(
          'size',
          (s) => Effect.sync(() => Option.getOrThrow(s.page.viewportSize())),
        ),
        Then('the reported viewport size is 600 by 400')((s, expect) =>
          expect(s.size).toEqual({ width: 600, height: 400 })
        ),
      ),
    )
  })
