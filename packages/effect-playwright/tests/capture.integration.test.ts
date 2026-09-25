import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Stream } from 'effect'
import {
  captureArtifactPath,
  captureArtifactSignature,
  captureArtifactSize,
  makeCaptureDirectory,
  removeCaptureDirectory,
} from './__fixtures__/capture-artifacts.js'

const Feature = makeFeature({ it })

const pngSignature = [0x89, 0x50, 0x4e, 0x47]
const pdfSignature = [0x25, 0x50, 0x44, 0x46]
const zipSignature = [0x50, 0x4b, 0x03, 0x04]
const webmSignature = [0x1a, 0x45, 0xdf, 0xa3]

const openPage = Effect.gen(function*() {
  const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
  const browser = yield* spawner.browser
  return yield* browser.newPage()
})

const scratchFor = Effect.gen(function*() {
  const directory = makeCaptureDirectory()
  yield* Effect.addFinalizer(() => Effect.sync(() => removeCaptureDirectory(directory)))
  return directory
})

Feature('Capturing images, downloads and recordings from a live page')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('image bytes, downloads and recordings are produced by a real browser on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'A page capture is a non-empty PNG image',
      Gherkin.Do.pipe(
        Given('a page showing a heading')(
          'page',
          () => openPage.pipe(Effect.tap((page) => page.goto('data:text/html,<h1>Screenshot Test</h1>'))),
        ),
        When('the page is captured as a PNG')('capture', (s) => s.page.screenshot({ type: 'png' })),
        Then('the capture is a PNG byte payload')((s, expect) =>
          expect({
            isBytes: s.capture instanceof Uint8Array,
            isNonEmpty: s.capture.length > 0,
            signature: Array.from(s.capture.slice(0, 4)),
          }).toEqual({ isBytes: true, isNonEmpty: true, signature: pngSignature })
        ),
      ),
    )

    scenario(
      'A page print is a non-empty PDF document',
      Gherkin.Do.pipe(
        Given('a page showing a heading')(
          'page',
          () => openPage.pipe(Effect.tap((page) => page.goto('data:text/html,<h1>PDF Test</h1>'))),
        ),
        When('the page is printed to PDF')('capture', (s) => s.page.pdf()),
        Then('the capture is a PDF byte payload')((s, expect) =>
          expect({
            isBytes: s.capture instanceof Uint8Array,
            isNonEmpty: s.capture.length > 0,
            signature: Array.from(s.capture.slice(0, 4)),
          }).toEqual({ isBytes: true, isNonEmpty: true, signature: pdfSignature })
        ),
      ),
    )

    scenario(
      'An element capture is a non-empty PNG image',
      Gherkin.Do.pipe(
        Given('a page with a badge element')('page', () =>
          openPage.pipe(
            Effect.tap((page) =>
              page.goto('data:text/html,<div id="badge" style="width:80px;height:40px;background:red">badge</div>')
            ),
          )),
        When('the badge is captured')('capture', (s) => s.page.locator('#badge').screenshot()),
        Then('the element capture is a non-empty PNG byte payload')((s, expect) =>
          expect({
            isBytes: s.capture instanceof Uint8Array,
            isNonEmpty: s.capture.length > 0,
            signature: Array.from(s.capture.slice(0, 4)),
          }).toEqual({ isBytes: true, isNonEmpty: true, signature: pngSignature })
        ),
      ),
    )

    scenario(
      'A download delivers its bytes through the download stream',
      Gherkin.Do.pipe(
        Given('a page offering a downloadable text file')('page', () =>
          openPage.pipe(
            Effect.tap((page) =>
              page.evaluate(() => {
                document.body.innerHTML =
                  '<a id="download" href="data:application/octet-stream,hello world" download="test.txt">Download</a>'
              })
            ),
          )),
        When('the download is observed after the link is clicked')('download', (s) =>
          Effect.gen(function*() {
            const announced = yield* s.page.eventStream('download').pipe(Stream.runHead, Effect.forkChild)
            yield* s.page.locator('#download').click()
            const download = yield* Fiber.join(announced).pipe(Effect.flatMap(Effect.fromOption))
            const text = yield* download.stream.pipe(
              Stream.decodeText(),
              Stream.runCollect,
              Effect.map((chunks) => chunks.join('')),
            )
            return {
              suggestedFilename: download.suggestedFilename(),
              isDataUrl: download.url().startsWith('data:'),
              text,
            }
          })),
        Then('the downloaded bytes are the offered text')((s, expect) =>
          expect(s.download).toEqual({ suggestedFilename: 'test.txt', isDataUrl: true, text: 'hello world' })
        ),
      ),
    )

    scenario(
      'Tracing records the session into a zip archive on disk',
      Gherkin.Do.pipe(
        Given('a context tracing to a temporary archive while a page is loaded')(
          'recording',
          () =>
            Effect.gen(function*() {
              const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
              const browser = yield* spawner.browser
              const context = yield* browser.newContext()
              const page = yield* context.newPage
              const artifact = captureArtifactPath(yield* scratchFor)
              const archive = artifact('trace.zip')
              yield* context.tracing.start({ screenshots: true, snapshots: true })
              yield* page.setContent('<h1>Traced page</h1>')
              yield* context.tracing.stop({ path: archive })
              return { size: captureArtifactSize(archive), signature: Array.from(captureArtifactSignature(archive)) }
            }),
        ),
        Then('the trace archive is a non-empty zip file')((s, expect) =>
          expect({ isNonEmpty: s.recording.size > 0, signature: s.recording.signature }).toEqual({
            isNonEmpty: true,
            signature: zipSignature,
          })
        ),
      ),
    )

    scenario(
      'Screencast records the session into a WebM video file',
      Gherkin.Do.pipe(
        Given('a page whose screencast records to a temporary video file')('recording', () =>
          Effect.gen(function*() {
            const page = yield* openPage
            const artifact = captureArtifactPath(yield* scratchFor)
            const video = artifact('session.webm')
            yield* page.screencast.start({ path: video })
            yield* page.setContent('<h1>Screencast Test</h1>')
            yield* page.evaluate(() => {
              document.body.style.backgroundColor = 'rebeccapurple'
            })
            yield* page.screencast.stop
            return { size: captureArtifactSize(video), signature: Array.from(captureArtifactSignature(video)) }
          })),
        Then('the screencast video is a non-empty WebM file')((s, expect) =>
          expect({ isNonEmpty: s.recording.size > 0, signature: s.recording.signature }).toEqual({
            isNonEmpty: true,
            signature: webmSignature,
          })
        ),
      ),
    )
  })
