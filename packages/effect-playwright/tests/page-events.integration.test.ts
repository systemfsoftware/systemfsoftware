import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Option, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Handling what the page raises')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'An alert the page raises can be answered by the program',
      Gherkin.Do.pipe(
        Given('a page about to raise an alert')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const dialog = yield* page.eventStream('dialog').pipe(Stream.runHead, Effect.forkChild)
            // alert blocks the page until answered — the evaluate runs on its own fiber
            const blocked = yield* page.evaluate(() => alert('hello world')).pipe(Effect.forkChild)
            return { page, dialog, blocked }
          })),
        When('the program answers the alert')('dialog', (s) =>
          Effect.gen(function*() {
            const dialog = Option.getOrThrow(yield* Fiber.join(s.pending.dialog))
            yield* dialog.accept()
            return dialog
          })),
        Then('the alert carried its message and kind')((s) => {
          expect(s.dialog.message()).toBe('hello world')
          expect(s.dialog.type()).toBe('alert')
        }),
        And('the page continued after the answer')((s) => Fiber.join(s.pending.blocked)),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A prompt answered with text delivers the answer to the page',
      Gherkin.Do.pipe(
        Given('a page asking a question with a prompt')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const dialog = yield* page.eventStream('dialog').pipe(Stream.runHead, Effect.forkChild)
            const answer = yield* page.evaluate(() => prompt('How many?')).pipe(Effect.forkChild)
            return { page, dialog, answer }
          })),
        When('the program answers with text')((s) =>
          Effect.gen(function*() {
            const dialog = Option.getOrThrow(yield* Fiber.join(s.pending.dialog))
            expect(dialog.message()).toBe('How many?')
            expect(dialog.type()).toBe('prompt')
            yield* dialog.accept('forty-two')
          })
        ),
        Then('the page received the answer')((s) =>
          Effect.map(Fiber.join(s.pending.answer), (answer) => {
            expect(answer).toBe('forty-two')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Clicking a file field opens a file chooser the program can see',
      Gherkin.Do.pipe(
        Given('a page with a file field and a watcher for choosers')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input type="file" id="fileinput" />')
            const chooser = yield* page.eventStream('filechooser').pipe(Stream.runHead, Effect.forkChild)
            return { page, chooser }
          })),
        When('the file field is clicked')((s) => s.pending.page.locator('#fileinput').click()),
        Then('a single-file chooser opened on that field')((s) =>
          Effect.map(Fiber.join(s.pending.chooser), (opened) => {
            const chooser = Option.getOrThrow(opened)
            expect(chooser.isMultiple()).toBe(false)
            expect(chooser.element()).not.toBeNull()
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A download link hands the file to the program',
      Gherkin.Do.pipe(
        Given('a page offering a file for download and a watcher for downloads')(
          'pending',
          () =>
            Effect.gen(function*() {
              const page = yield* freshPage
              yield* page.setContent(
                '<a id="download" href="data:application/octet-stream,hello world" download="test.txt">Download</a>',
              )
              const download = yield* page.eventStream('download').pipe(Stream.runHead, Effect.forkChild)
              return { page, download }
            }),
        ),
        When('the download link is clicked')('download', (s) =>
          Effect.gen(function*() {
            yield* s.pending.page.locator('#download').click()
            return Option.getOrThrow(yield* Fiber.join(s.pending.download))
          })),
        Then('the file arrives with its suggested name')((s) => {
          expect(s.download.suggestedFilename()).toBe('test.txt')
          expect(s.download.url().startsWith('data:')).toBe(true)
        }),
        And('the file contents stream to the program')((s) =>
          Effect.map(
            s.download.stream.pipe(Stream.decodeText(), Stream.runCollect),
            (chunks) => {
              expect(chunks.join('')).toBe('hello world')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A popup window knows the page that opened it',
      Gherkin.Do.pipe(
        Given('a page that will open a popup')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            const popup = yield* page.eventStream('popup').pipe(Stream.runHead, Effect.forkChild)
            return { page, popup }
          })),
        When('the page opens a popup window')((s) => s.pending.page.evaluate(() => window.open('about:blank'))),
        Then('the popup points back at its opener')((s) =>
          Effect.gen(function*() {
            const popup = Option.getOrThrow(yield* Fiber.join(s.pending.popup))
            const opener = yield* popup.opener
            expect(Option.isSome(opener)).toBe(true)
            if (Option.isSome(opener)) {
              expect(opener.value.url()).toBe('about:blank')
            }
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
