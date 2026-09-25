import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Option, Stream } from 'effect'
import { pageInFreshBrowser } from './__fixtures__/browser-page.js'
import { firstEvent } from './__fixtures__/event-stream.js'

const Feature = makeFeature({ it })

Feature('Observing the traffic and page output while a program drives a browser')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium performs the routed navigation and writes its console on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'A routed navigation is observed as a request and a response the program reads',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a routed page is navigated to')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.use((nativePage) =>
              nativePage.route(
                /http:\/\/fixture\.test\//,
                (route) =>
                  route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: '<!doctype html><title>Fixture</title>',
                  }),
              )
            )
            const pendingRequest = yield* firstEvent(
              page.eventStream('request').pipe(
                Stream.filter((request) => request.isNavigationRequest()),
              ),
            )
            const pendingResponse = yield* firstEvent(
              page.eventStream('response').pipe(
                Stream.filter((response) => response.url() === 'http://fixture.test/'),
              ),
            )
            yield* page.goto('http://fixture.test/')
            const request = Option.getOrThrow(yield* Fiber.join(pendingRequest))
            const response = Option.getOrThrow(yield* Fiber.join(pendingResponse))
            const requestResponse = yield* request.response
            const existingResponse = request.existingResponse()
            const httpVersion = yield* response.httpVersion
            return {
              requestUrl: request.url(),
              requestMethod: request.method(),
              requestIsNavigation: request.isNavigationRequest(),
              responseUrl: response.url(),
              responseOk: response.ok(),
              responseStatus: response.status(),
              contentTypeIsHtml: (response.headers()['content-type'] ?? '').startsWith('text/html'),
              responseRequestUrl: response.request().url(),
              requestResponseIsSome: Option.isSome(requestResponse),
              requestResponseMatches: Option.isSome(requestResponse) && requestResponse.value.url() === response.url(),
              existingResponseIsSome: Option.isSome(existingResponse),
              existingResponseMatches: Option.isSome(existingResponse) &&
                existingResponse.value.url() === response.url(),
              httpVersionIsText: httpVersion.length > 0,
            }
          })),
        Then('the request and response describe the routed navigation')((state, expect) =>
          expect(state.observed).toEqual({
            requestUrl: 'http://fixture.test/',
            requestMethod: 'GET',
            requestIsNavigation: true,
            responseUrl: 'http://fixture.test/',
            responseOk: true,
            responseStatus: 200,
            contentTypeIsHtml: true,
            responseRequestUrl: 'http://fixture.test/',
            requestResponseIsSome: true,
            requestResponseMatches: true,
            existingResponseIsSome: true,
            existingResponseMatches: true,
            httpVersionIsText: true,
          })
        ),
      ),
    )

    scenario(
      'A navigation request without a body reports no post data and no failure',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a page with an empty body is navigated to')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.use((nativePage) =>
              nativePage.route(
                /http:\/\/empty\.test\//,
                (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
              )
            )
            const pending = yield* firstEvent(
              page.eventStream('request').pipe(
                Stream.filter((request) => request.isNavigationRequest()),
              ),
            )
            yield* page.goto('http://empty.test/')
            const request = Option.getOrThrow(yield* Fiber.join(pending))
            const json = yield* request.postDataJSON
            return {
              postDataIsNone: Option.isNone(request.postData()),
              postDataBufferIsNone: Option.isNone(request.postDataBuffer()),
              failureIsNone: Option.isNone(request.failure()),
              jsonIsNone: Option.isNone(json),
            }
          })),
        Then('every body accessor reports nothing')((state, expect) =>
          expect(state.observed).toEqual({
            postDataIsNone: true,
            postDataBufferIsNone: true,
            failureIsNone: true,
            jsonIsNone: true,
          })
        ),
      ),
    )

    scenario(
      'A JSON POST body is exposed as text, bytes, and parsed JSON',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a JSON payload is posted to a routed endpoint')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.use((nativePage) =>
              nativePage.route(
                /http:\/\/post\.test\//,
                (route) =>
                  route.request().url().endsWith('/submit')
                    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
                    : route.fulfill({
                      status: 200,
                      contentType: 'text/html',
                      body:
                        '<!doctype html><script>fetch("/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({hello:"world"})})</script>',
                    }),
              )
            )
            const pending = yield* firstEvent(
              page.eventStream('request').pipe(Stream.filter((request) => request.method() === 'POST')),
            )
            yield* page.goto('http://post.test/')
            const request = Option.getOrThrow(yield* Fiber.join(pending))
            const text = request.postData()
            const buffer = request.postDataBuffer()
            const json = yield* request.postDataJSON
            const bytes = Option.isSome(buffer) ? buffer.value : new Uint8Array()
            return {
              postDataIsSome: Option.isSome(text),
              postDataText: Option.isSome(text) ? text.value : null,
              bufferIsUint8Array: Option.isSome(buffer) && buffer.value instanceof Uint8Array,
              bufferMatchesText: Option.isSome(buffer) && Option.isSome(text) &&
                new TextDecoder().decode(buffer.value) === text.value,
              byteCount: bytes.length,
              jsonOption: json,
            }
          })),
        Then('the posted body is readable as text, bytes, and JSON')((state, expect) =>
          expect(state.observed).toEqual({
            postDataIsSome: true,
            postDataText: '{"hello":"world"}',
            bufferIsUint8Array: true,
            bufferMatchesText: true,
            byteCount: 17,
            jsonOption: Option.some({ hello: 'world' }),
          })
        ),
      ),
    )

    scenario(
      'A request that fails on the way out reports its failure',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a navigation to a blocked host is aborted')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.use((nativePage) =>
              nativePage.route(/http:\/\/blocked\.test\//, (route) => route.abort('failed'))
            )
            const pending = yield* firstEvent(
              page.eventStream('requestfailed').pipe(
                Stream.filter((request) => request.url().includes('blocked.test')),
              ),
            )
            yield* page.goto('http://blocked.test/').pipe(Effect.ignore)
            const request = Option.getOrThrow(yield* Fiber.join(pending))
            const failure = request.failure()
            return {
              failureIsSome: Option.isSome(failure),
              errorTextIsText: Option.isSome(failure) && failure.value.errorText.length > 0,
            }
          })),
        Then('the request reports a failure with its error text')((state, expect) =>
          expect(state.observed).toEqual({ failureIsSome: true, errorTextIsText: true })
        ),
      ),
    )

    scenario(
      'Messages written to the console are collected in order',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a page whose script logs a message and a warning is navigated to')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.goto(
                'data:text/html,<script>console.log("Hello from page");console.warn("Warning from page")</script>',
              )
              const messages = yield* page.consoleMessages()
              return { texts: messages.map((message) => message.text()) }
            }),
        ),
        Then('the collected console messages are the two written ones')((state, expect) =>
          expect(state.observed).toEqual({ texts: ['Hello from page', 'Warning from page'] })
        ),
      ),
    )

    scenario(
      'An uncaught error thrown while the page loads is observed as a page error event',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('a page whose script throws is navigated to')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* firstEvent(page.eventStream('pageerror'))
            yield* page.goto('data:text/html,<script>throw new Error("Test Error")</script>')
            const error = Option.getOrThrow(yield* Fiber.join(pending))
            return { message: error.message }
          })),
        Then('the page error carries the thrown message')((state, expect) =>
          expect(state.observed).toEqual({ message: 'Test Error' })
        ),
      ),
    )

    scenario(
      'An uncaught page error is kept in the list the page reports',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page has thrown while loading')('observed', ({ page }) =>
          Effect.gen(function*() {
            const pending = yield* firstEvent(page.eventStream('pageerror'))
            yield* page.goto('data:text/html,<script>throw new Error("Test Error")</script>')
            yield* Fiber.join(pending)
            const errors = yield* page.pageErrors()
            return { messages: errors.map((error) => error.message) }
          })),
        Then('the recorded page errors hold the thrown message')((state, expect) =>
          expect(state.observed).toEqual({ messages: ['Test Error'] })
        ),
      ),
    )
  })
