import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Exit, Fiber, Option, Stream } from 'effect'

const Feature = makeFeature({ it })

const freshBrowser = () =>
  Effect.gen(function*() {
    const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
    return yield* spawner.browser
  })

const pageInFreshBrowser = () =>
  Effect.gen(function*() {
    const browser = yield* freshBrowser()
    return yield* browser.newPage()
  })

const firstEvent = <A>(stream: Stream.Stream<A>) => Effect.forkChild(Stream.runHead(stream), { startImmediately: true })

const completedCount = <A, E>(awaited: Option.Option<Exit.Exit<ReadonlyArray<A>, E>>) =>
  Option.flatMap(awaited, (exit) => Exit.isSuccess(exit) ? Option.some(exit.value.length) : Option.none())

Feature('Being told about the things a page does while the program drives it')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium raises these events on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'An alert raised while the page loads arrives as a dialog the program answers',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page raises an alert while it loads')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* firstEvent(page.eventStream('dialog'))
            const navigation = yield* Effect.forkChild(
              page.goto('data:text/html,<script>alert("hello world")</script>'),
              { startImmediately: true },
            )
            const dialog = Option.getOrThrow(yield* Fiber.join(pending))
            const message = dialog.message()
            const kind = dialog.type()
            yield* dialog.accept()
            yield* Fiber.join(navigation)
            return { message, kind }
          })),
        Then('the dialog reports the alert and is accepted')((state, expect) =>
          expect(state.observed).toEqual({ message: 'hello world', kind: 'alert' })
        ),
      ),
    )

    scenario(
      'Clicking a file input arrives as a file chooser the program can answer',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the file input is clicked')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.evaluate(() => {
              document.body.innerHTML = '<input type="file" id="fileinput" />'
            })
            const pending = yield* firstEvent(page.eventStream('filechooser'))
            yield* page.locator('#fileinput').click()
            const chooser = Option.getOrThrow(yield* Fiber.join(pending))
            const elementName = yield* Effect.promise(() => chooser.element().evaluate((element) => element.nodeName))
            return {
              allowsMultiple: chooser.isMultiple(),
              elementName,
            }
          })),
        Then('the file chooser describes the single-file input')((state, expect) =>
          expect(state.observed).toEqual({ allowsMultiple: false, elementName: 'INPUT' })
        ),
      ),
    )

    scenario(
      'Downloading a data URL arrives as a download whose bytes the program reads',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('a link with a data URL download is clicked')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.evaluate(() => {
              document.body.innerHTML =
                '<a id="download" href="data:application/octet-stream,hello world" download="test.txt">Download</a>'
            })
            const pending = yield* firstEvent(page.eventStream('download'))
            yield* page.locator('#download').click()
            const download = Option.getOrThrow(yield* Fiber.join(pending))
            const chunks = yield* download.stream.pipe(Stream.runCollect)
            const bytes = chunks.reduce<Uint8Array>((accumulated, chunk) => {
              const merged = new Uint8Array(accumulated.length + chunk.length)
              merged.set(accumulated)
              merged.set(chunk, accumulated.length)
              return merged
            }, new Uint8Array())
            return {
              suggestedFilename: download.suggestedFilename(),
              urlScheme: download.url().split(':')[0],
              bytesAreUint8Array: chunks.length > 0 && chunks.every((chunk) => chunk instanceof Uint8Array),
              byteCount: bytes.length,
              text: new TextDecoder().decode(bytes),
            }
          })),
        Then('the download reports its name and payload')((state, expect) =>
          expect(state.observed).toEqual({
            suggestedFilename: 'test.txt',
            urlScheme: 'data',
            bytesAreUint8Array: true,
            byteCount: 11,
            text: 'hello world',
          })
        ),
      ),
    )

    scenario(
      'Opening a window arrives as a popup that points back at its opener',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page opens a blank window')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.goto('about:blank')
            const pending = yield* firstEvent(page.eventStream('popup'))
            yield* page.evaluate(() => {
              window.open('about:blank')
            })
            const popup = Option.getOrThrow(yield* Fiber.join(pending))
            const opener = yield* popup.opener
            return {
              hasOpener: Option.isSome(opener),
              openerUrl: Option.isSome(opener) ? opener.value.url() : null,
            }
          })),
        Then('the popup reports the page that opened it')((state, expect) =>
          expect(state.observed).toEqual({ hasOpener: true, openerUrl: 'about:blank' })
        ),
      ),
    )

    scenario(
      'Spawning a worker arrives as a worker the program can run code in',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page starts a worker from a blob URL')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* firstEvent(page.eventStream('worker'))
            yield* page.evaluate(() => {
              const blob = new Blob(['console.log("worker")'], { type: 'application/javascript' })
              new Worker(URL.createObjectURL(blob))
            })
            const worker = Option.getOrThrow(yield* Fiber.join(pending))
            const url = worker.url()
            const summed = yield* worker.evaluate(() => 1 + 1)
            return { urlScheme: url.split(':')[0], summed }
          })),
        Then('the worker reports a blob origin and runs its code')((state, expect) =>
          expect(state.observed).toEqual({ urlScheme: 'blob', summed: 2 })
        ),
      ),
    )

    scenario(
      'A page that has started a worker lists it among its workers',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page has started a worker')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* firstEvent(page.eventStream('worker'))
            yield* page.goto(
              "data:text/html,<script>new Worker(URL.createObjectURL(new Blob(['console.log(\"worker\")'], {type: 'application/javascript'})));</script>",
            )
            yield* Fiber.join(pending)
            const workers = page.workers()
            return {
              countAtLeastOne: workers.length >= 1,
              everyUrlIsText: workers.every((worker) => typeof worker.url() === 'string'),
            }
          })),
        Then('the worker list holds the page worker')((state, expect) =>
          expect(state.observed).toEqual({ countAtLeastOne: true, everyUrlIsText: true })
        ),
      ),
    )

    scenario(
      'A console subscription stops once the page it watches closes',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page closes while a console subscription runs')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* Effect.forkChild(Stream.runCollect(page.eventStream('console')), {
              startImmediately: true,
            })
            yield* page.close
            const awaited = yield* Fiber.await(pending).pipe(Effect.timeoutOption('15 seconds'))
            const counted = completedCount(awaited)
            return { completed: Option.isSome(counted), emittedCount: Option.getOrElse(counted, () => -1) }
          })),
        Then('the subscription completes with nothing emitted')((state, expect) =>
          expect(state.observed).toEqual({ completed: true, emittedCount: 0 })
        ),
      ),
    )

    scenario(
      'A console subscription stops once the browser it watches closes',
      Gherkin.Do.pipe(
        Given('a fresh browser')('browser', freshBrowser),
        Given('a page in that browser')('page', ({ browser }) => browser.newPage()),
        When('the browser closes while a console subscription runs')(
          'observed',
          ({ browser, page }) =>
            Effect.gen(function*() {
              const pending = yield* Effect.forkChild(Stream.runCollect(page.eventStream('console')), {
                startImmediately: true,
              })
              yield* browser.close
              const awaited = yield* Fiber.await(pending).pipe(Effect.timeoutOption('15 seconds'))
              const counted = completedCount(awaited)
              return {
                completed: Option.isSome(counted),
                emittedCount: Option.getOrElse(counted, () => -1),
                stillConnected: browser.isConnected(),
              }
            }),
        ),
        Then('the subscription completes and the browser reports itself disconnected')((state, expect) =>
          expect(state.observed).toEqual({ completed: true, emittedCount: 0, stillConnected: false })
        ),
      ),
    )
  })
