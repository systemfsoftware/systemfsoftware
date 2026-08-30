import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Cause, Effect, Fiber, Option, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Common Playwright primitives').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'request and response are exposed when navigating to a URL',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      const requestFiber = yield* page.eventStream('request').pipe(Stream.runHead, Effect.forkChild)

      const responseFiber = yield* page.eventStream('response').pipe(Stream.runHead, Effect.forkChild)

      yield* page.goto('http://example.com')

      const requestOption = yield* Fiber.join(requestFiber)
      const responseOption = yield* Fiber.join(responseFiber)
      if (!Option.isSome(requestOption) || !Option.isSome(responseOption)) {
        return yield* Effect.fail(
          StepError.make({ keyword: 'Then', text: 'missing request or response', cause: undefined }),
        )
      }
      const request = requestOption.value
      const response = responseOption.value

      expect(request).toMatchObject({ _tag: 'effect-playwright/common/Request' })
      expect(request.url().includes('example.com')).toBe(true)
      expect(request.method()).toBe('GET')
      expect(request.isNavigationRequest()).toBe(true)

      expect(response).toMatchObject({ _tag: 'effect-playwright/common/Response' })
      expect(response.url().includes('example.com')).toBe(true)
      expect(response.ok()).toBe(true)
      expect(response.status()).toBe(200)

      const headers = response.headers()
      expect(headers['content-type']).toBeDefined()

      const respRequest = response.request()
      expect(respRequest.url().includes('example.com')).toBe(true)

      const requestResponse = yield* request.response
      expect(Option.isSome(requestResponse)).toBe(true)
      if (Option.isSome(requestResponse)) {
        expect(requestResponse.value.url()).toBe(response.url())
      }

      const existingResponse = request.existingResponse()
      expect(Option.isSome(existingResponse)).toBe(true)
      if (Option.isSome(existingResponse)) {
        expect(existingResponse.value.url()).toBe(response.url())
      }

      const httpVersion = yield* response.httpVersion
      expect(typeof httpVersion).toBe('string')
      expect(httpVersion.length).toBeGreaterThan(0)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'worker is exposed when a worker is created',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      const workerFiber = yield* page.eventStream('worker').pipe(Stream.runHead, Effect.forkChild)

      yield* page.evaluate(() => {
        const blob = new Blob(['console.log("worker")'], {
          type: 'application/javascript',
        })
        new Worker(URL.createObjectURL(blob))
      })

      const workerOption = yield* Fiber.join(workerFiber)
      if (!Option.isSome(workerOption)) {
        return yield* Effect.fail(StepError.make({ keyword: 'Then', text: 'missing worker', cause: undefined }))
      }
      const worker = workerOption.value

      expect(worker).toMatchObject({ _tag: 'effect-playwright/common/Worker' })
      expect(worker.url().startsWith('blob:')).toBe(true)
      const result = yield* worker.evaluate(() => 1 + 1)
      expect(result).toBe(2)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'dialog is exposed when an alert is triggered',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      const dialogFiber = yield* page.eventStream('dialog').pipe(Stream.runHead, Effect.forkChild)

      yield* page.evaluate(() => {
        // integration: real browser timer drives alert
        setTimeout(() => alert('hello world'), 10)
      })

      const dialogOption = yield* Fiber.join(dialogFiber)
      if (!Option.isSome(dialogOption)) {
        return yield* Effect.fail(StepError.make({ keyword: 'Then', text: 'missing dialog', cause: undefined }))
      }
      const dialog = dialogOption.value

      expect(dialog).toMatchObject({ _tag: 'effect-playwright/common/Dialog' })
      expect(dialog.message()).toBe('hello world')
      expect(dialog.type()).toBe('alert')

      yield* dialog.accept()
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'file chooser is exposed when a file input is clicked',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        document.body.innerHTML = '<input type="file" id="fileinput" />'
      })

      const fileChooserFiber = yield* page.eventStream('filechooser').pipe(Stream.runHead, Effect.forkChild)

      yield* page.locator('#fileinput').click()

      const fileChooserOption = yield* Fiber.join(fileChooserFiber)
      if (!Option.isSome(fileChooserOption)) {
        return yield* Effect.fail(StepError.make({ keyword: 'Then', text: 'missing file chooser', cause: undefined }))
      }
      const fileChooser = fileChooserOption.value

      expect(fileChooser).toMatchObject({ _tag: 'effect-playwright/common/FileChooser' })
      expect(fileChooser.isMultiple()).toBe(false)
      expect(fileChooser.element()).not.toBeNull()
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'download is exposed when a download link is clicked',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        document.body.innerHTML =
          '<a text="Download" id="download" href="data:application/octet-stream,hello world" download="test.txt">Download</a>'
      })

      const downloadFiber = yield* page.eventStream('download').pipe(Stream.runHead, Effect.forkChild)

      yield* page.locator('#download').click()

      const downloadOption = yield* Fiber.join(downloadFiber)
      if (!Option.isSome(downloadOption)) {
        return yield* Effect.fail(StepError.make({ keyword: 'Then', text: 'missing download', cause: undefined }))
      }
      const download = downloadOption.value

      expect(download).toMatchObject({ _tag: 'effect-playwright/common/Download' })
      expect(download.suggestedFilename()).toBe('test.txt')
      const url = download.url()
      expect(url.startsWith('data:')).toBe(true)

      const text = yield* download.stream.pipe(
        Stream.decodeText(),
        Stream.runCollect,
        Effect.map((chunks) => chunks.join('')),
      )

      expect(text).toBe('hello world')
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )
})
