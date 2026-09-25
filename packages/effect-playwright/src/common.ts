/**
 * Effect-aware wrappers for Playwright requests, responses, workers, dialogs,
 * file choosers, and downloads.
 */

import { Context, Effect, Option, Stream } from 'effect'
import { dual } from 'effect/Function'
import type {
  Dialog as CoreDialog,
  Download as CoreDownload,
  ElementHandle,
  FileChooser as CoreFileChooser,
  Request as CoreRequest,
  Response as CoreResponse,
  Worker as CoreWorker,
} from 'playwright-core'
import { wrapError } from './errors.js'
import type { PlaywrightError } from './errors.schema.js'
import type { Frame } from './frame.js'
import type { Page } from './page.js'
import { useHelper } from './utils.js'
import type { Wrappers } from './wrappers.js'

export interface Request {
  /**
   * An object with all the request HTTP headers associated with this request. The header names are lower-cased.
   * @see {@link CoreRequest.allHeaders}
   */
  allHeaders: Effect.Effect<Awaited<ReturnType<CoreRequest['allHeaders']>>, PlaywrightError>
  /**
   * Returns the matching Response object, or null if the response was not received yet.
   * @see {@link CoreRequest.existingResponse}
   */
  existingResponse: () => Option.Option<Response>
  /**
   * The method returns null unless this request was a failed one.
   * @see {@link CoreRequest.failure}
   */
  failure: () => Option.Option<NonNullable<ReturnType<CoreRequest['failure']>>>
  /**
   * Returns the Frame that initiated this request.
   * @see {@link CoreRequest.frame}
   */
  frame: Effect.Effect<Frame, PlaywrightError>
  /**
   * Returns the value of the header matching the name. The name is case insensitive.
   * @see {@link CoreRequest.headerValue}
   */
  headerValue: (name: string) => Effect.Effect<Option.Option<string>, PlaywrightError>
  /**
   * An object with the request HTTP headers. The header names are lower-cased.
   * @see {@link CoreRequest.headers}
   */
  headers: () => ReturnType<CoreRequest['headers']>
  /**
   * An array with all the request HTTP headers associated with this request.
   * @see {@link CoreRequest.headersArray}
   */
  headersArray: Effect.Effect<Awaited<ReturnType<CoreRequest['headersArray']>>, PlaywrightError>
  /**
   * Whether this request is driving frame's navigation.
   * @see {@link CoreRequest.isNavigationRequest}
   */
  isNavigationRequest: () => boolean
  /**
   * Request's method (GET, POST, etc.)
   * @see {@link CoreRequest.method}
   */
  method: () => string
  /**
   * Request's post body, if any.
   * @see {@link CoreRequest.postData}
   */
  postData: () => Option.Option<string>
  /**
   * Request's post body in a binary form, if any.
   * @see {@link CoreRequest.postDataBuffer}
   */
  postDataBuffer: () => Option.Option<Uint8Array>
  /**
   * Returns parsed request's body for form-urlencoded and JSON requests.
   * @see {@link CoreRequest.postDataJSON}
   */
  postDataJSON: Effect.Effect<
    Option.Option<NonNullable<Awaited<ReturnType<CoreRequest['postDataJSON']>>>>,
    PlaywrightError
  >
  /**
   * Request that was redirected by the server to this one, if any.
   * @see {@link CoreRequest.redirectedFrom}
   */
  redirectedFrom: () => Option.Option<Request>
  /**
   * New request issued by the browser if the server responded with redirect.
   * @see {@link CoreRequest.redirectedTo}
   */
  redirectedTo: () => Option.Option<Request>
  /**
   * Contains the request's resource type as it was perceived by the rendering engine.
   * @see {@link CoreRequest.resourceType}
   */
  resourceType: () => string
  /**
   * Returns the matching Response object, or null if the response was not received due to error.
   * @see {@link CoreRequest.response}
   */
  response: Effect.Effect<Option.Option<Response>, PlaywrightError>
  /**
   * Returns the ServiceWorker that initiated this request.
   * @see {@link CoreRequest.serviceWorker}
   */
  serviceWorker: () => Option.Option<Worker>
  /**
   * Returns resource size information for given request.
   * @see {@link CoreRequest.sizes}
   */
  sizes: Effect.Effect<Awaited<ReturnType<CoreRequest['sizes']>>, PlaywrightError>
  /**
   * Returns resource timing information for given request.
   * @see {@link CoreRequest.timing}
   */
  timing: () => ReturnType<CoreRequest['timing']>
  /**
   * URL of the request.
   * @see {@link CoreRequest.url}
   */
  url: () => string
}

/**
 * Service for a {@link Request}.
 */
export const Request = Context.Service<Request>('effect-playwright/common/Request')

/**
 * Creates a `Request` from a Playwright `Request` instance.
 *
 * @param request - The Playwright `Request` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildRequest: {
  (request: CoreRequest, wrap: Wrappers): Request
  (wrap: Wrappers): (request: CoreRequest) => Request
} = dual(2, (request: CoreRequest, wrap: Wrappers): Request => {
  const use = useHelper(request)

  return Request.of({
    allHeaders: use(() => request.allHeaders()),
    existingResponse: (): Option.Option<Response> =>
      Option.fromNullishOr(request.existingResponse()).pipe(Option.map(wrap.response)),
    failure: () => Option.fromNullishOr(request.failure()),
    frame: Effect.try({
      try: () => wrap.frame(request.frame()),
      catch: wrapError,
    }),
    headerValue: (name) => use(() => request.headerValue(name)).pipe(Effect.map(Option.fromNullishOr)),
    headers: () => request.headers(),
    headersArray: use(() => request.headersArray()),
    isNavigationRequest: () => request.isNavigationRequest(),
    method: () => request.method(),
    postData: () => Option.fromNullishOr(request.postData()),
    postDataBuffer: () => Option.fromNullishOr(request.postDataBuffer()),
    postDataJSON: Effect.try({
      try: () => Option.fromNullishOr(request.postDataJSON()),
      catch: wrapError,
    }),
    redirectedFrom: (): Option.Option<Request> =>
      Option.fromNullishOr(request.redirectedFrom()).pipe(Option.map(wrap.request)),
    redirectedTo: (): Option.Option<Request> =>
      Option.fromNullishOr(request.redirectedTo()).pipe(Option.map(wrap.request)),
    resourceType: () => request.resourceType(),
    response: use(() => request.response()).pipe(
      Effect.map(Option.fromNullishOr),
      Effect.map(Option.map(wrap.response)),
    ),
    serviceWorker: () => Option.fromNullishOr(request.serviceWorker()).pipe(Option.map(wrap.worker)),
    sizes: use(() => request.sizes()),
    timing: () => request.timing(),
    url: () => request.url(),
  })
})

export interface Response {
  allHeaders: Effect.Effect<Awaited<ReturnType<CoreResponse['allHeaders']>>, PlaywrightError>
  body: Effect.Effect<Awaited<ReturnType<CoreResponse['body']>>, PlaywrightError>
  finished: Effect.Effect<Awaited<ReturnType<CoreResponse['finished']>>, PlaywrightError>
  frame: Effect.Effect<Frame, PlaywrightError>
  fromServiceWorker: () => boolean
  headers: () => ReturnType<CoreResponse['headers']>
  headersArray: Effect.Effect<Awaited<ReturnType<CoreResponse['headersArray']>>, PlaywrightError>
  headerValue: (name: string) => Effect.Effect<Option.Option<string>, PlaywrightError>
  headerValues: (name: string) => Effect.Effect<
    Awaited<ReturnType<CoreResponse['headerValues']>>,
    PlaywrightError
  >
  /**
   * Returns the HTTP version of the response.
   * @see {@link CoreResponse.httpVersion}
   */
  httpVersion: Effect.Effect<Awaited<ReturnType<CoreResponse['httpVersion']>>, PlaywrightError>
  json: Effect.Effect<Awaited<ReturnType<CoreResponse['json']>>, PlaywrightError>
  ok: () => boolean
  request: () => Request
  securityDetails: Effect.Effect<
    Option.Option<NonNullable<Awaited<ReturnType<CoreResponse['securityDetails']>>>>,
    PlaywrightError
  >
  serverAddr: Effect.Effect<
    Option.Option<NonNullable<Awaited<ReturnType<CoreResponse['serverAddr']>>>>,
    PlaywrightError
  >
  status: () => number
  statusText: () => string
  text: Effect.Effect<Awaited<ReturnType<CoreResponse['text']>>, PlaywrightError>
  url: () => string
}

/**
 * Service for a {@link Response}.
 */
export const Response = Context.Service<Response>('effect-playwright/common/Response')

/**
 * Creates a `Response` from a Playwright `Response` instance.
 *
 * @param response - The Playwright `Response` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildResponse: {
  (response: CoreResponse, wrap: Wrappers): Response
  (wrap: Wrappers): (response: CoreResponse) => Response
} = dual(2, (response: CoreResponse, wrap: Wrappers): Response => {
  const use = useHelper(response)

  return Response.of({
    allHeaders: use(() => response.allHeaders()),
    body: use(() => response.body()),
    finished: use(() => response.finished()),
    frame: Effect.try({
      try: () => wrap.frame(response.frame()),
      catch: wrapError,
    }),
    fromServiceWorker: () => response.fromServiceWorker(),
    headers: () => response.headers(),
    headersArray: use(() => response.headersArray()),
    headerValue: (name) => use(() => response.headerValue(name)).pipe(Effect.map(Option.fromNullishOr)),
    headerValues: (name) => use(() => response.headerValues(name)),
    httpVersion: use(() => response.httpVersion()),
    json: use(() => response.json()),
    ok: () => response.ok(),
    request: () => wrap.request(response.request()),
    securityDetails: use(() => response.securityDetails()).pipe(
      Effect.map(Option.fromNullishOr),
    ),
    serverAddr: use(() => response.serverAddr()).pipe(Effect.map(Option.fromNullishOr)),
    status: () => response.status(),
    statusText: () => response.statusText(),
    text: use(() => response.text()),
    url: () => response.url(),
  })
})

declare const coreWorkerEvaluate: CoreWorker['evaluate']

/**
 * The page function argument accepted by {@link Worker.evaluate}.
 */
export type WorkerEvaluateFunction<Arg, R> = Parameters<typeof coreWorkerEvaluate<R, Arg>>[0]

/**
 * Widens an omitted argument to the required slot Playwright's evaluated-function
 * overload declares; the runtime accepts the argument being absent.
 */
function assertEvaluateArg<Arg>(_value: Arg | undefined): asserts _value is Arg {}

export interface Worker {
  evaluate: <R, Arg = void>(
    pageFunction: WorkerEvaluateFunction<Arg, R>,
    arg?: Arg,
  ) => Effect.Effect<R, PlaywrightError>
  url: () => string
}

/**
 * Service for a {@link Worker}.
 */
export const Worker = Context.Service<Worker>('effect-playwright/common/Worker')

/**
 * Creates a `Worker` from a Playwright `Worker` instance.
 *
 * @param worker - The Playwright `Worker` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildWorker: {
  (worker: CoreWorker, wrap: Wrappers): Worker
  (wrap: Wrappers): (worker: CoreWorker) => Worker
} = dual(2, (worker: CoreWorker, _wrap: Wrappers): Worker => {
  const use = useHelper(worker)

  return Worker.of({
    evaluate: <R, Arg = void>(f: WorkerEvaluateFunction<Arg, R>, arg?: Arg) =>
      use((worker) => {
        assertEvaluateArg<Arg>(arg)
        return worker.evaluate<R, Arg>(f, arg)
      }),
    url: () => worker.url(),
  })
})

export interface Dialog {
  accept: (promptText?: string) => Effect.Effect<void, PlaywrightError>
  defaultValue: () => string
  dismiss: Effect.Effect<void, PlaywrightError>
  message: () => string
  page: () => Option.Option<Page>
  type: () => string
}

/**
 * Service for a {@link Dialog}.
 */
export const Dialog = Context.Service<Dialog>('effect-playwright/common/Dialog')

/**
 * Creates a `Dialog` from a Playwright `Dialog` instance.
 *
 * @param dialog - The Playwright `Dialog` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildDialog: {
  (dialog: CoreDialog, wrap: Wrappers): Dialog
  (wrap: Wrappers): (dialog: CoreDialog) => Dialog
} = dual(2, (dialog: CoreDialog, wrap: Wrappers): Dialog => {
  const use = useHelper(dialog)

  return Dialog.of({
    accept: (promptText) => use(() => dialog.accept(promptText)),
    defaultValue: () => dialog.defaultValue(),
    dismiss: use(() => dialog.dismiss()),
    message: () => dialog.message(),
    page: () => Option.fromNullishOr(dialog.page()).pipe(Option.map(wrap.page)),
    type: () => dialog.type(),
  })
})

export interface FileChooser {
  element: () => ElementHandle
  isMultiple: () => boolean
  page: () => Page
  setFiles: (
    files: Parameters<CoreFileChooser['setFiles']>[0],
    options?: Parameters<CoreFileChooser['setFiles']>[1],
  ) => Effect.Effect<void, PlaywrightError>
}

/**
 * Service for a {@link FileChooser}.
 */
export const FileChooser = Context.Service<FileChooser>('effect-playwright/common/FileChooser')

/**
 * Creates a `FileChooser` from a Playwright `FileChooser` instance.
 *
 * @param fileChooser - The Playwright `FileChooser` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildFileChooser: {
  (fileChooser: CoreFileChooser, wrap: Wrappers): FileChooser
  (wrap: Wrappers): (fileChooser: CoreFileChooser) => FileChooser
} = dual(2, (fileChooser: CoreFileChooser, wrap: Wrappers): FileChooser => {
  const use = useHelper(fileChooser)

  return FileChooser.of({
    element: () => fileChooser.element(),
    isMultiple: () => fileChooser.isMultiple(),
    page: () => wrap.page(fileChooser.page()),
    setFiles: (files, options) => use(() => fileChooser.setFiles(files, options)),
  })
})

export interface Download {
  cancel: Effect.Effect<void, PlaywrightError>
  /**
   * Creates a stream of the download data.
   */
  stream: Stream.Stream<Uint8Array, PlaywrightError>
  delete: Effect.Effect<void, PlaywrightError>
  failure: Effect.Effect<Option.Option<string | null>, PlaywrightError>
  page: () => Page
  path: Effect.Effect<Option.Option<string | null>, PlaywrightError>
  saveAs: (path: string) => Effect.Effect<void, PlaywrightError>
  suggestedFilename: () => string
  url: () => string
  use: <R>(f: (download: CoreDownload) => Promise<R>) => Effect.Effect<R, PlaywrightError>
}

/**
 * Service for a {@link Download}.
 */
export const Download = Context.Service<Download>('effect-playwright/common/Download')

/**
 * Converts a downloaded stream chunk to `Uint8Array`.
 *
 * Playwright's download read stream yields binary `Buffer` chunks (`Buffer` is
 * a `Uint8Array` subtype) or strings; this keeps the stream typed as
 * `Uint8Array` without importing `node:stream`.
 */
const textEncoder = new TextEncoder()

const toUint8Array = (chunk: string | Uint8Array): Uint8Array =>
  typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk

/**
 * Creates a `Download` from a Playwright `Download` instance.
 *
 * @param download - The Playwright `Download` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildDownload: {
  (download: CoreDownload, wrap: Wrappers): Download
  (wrap: Wrappers): (download: CoreDownload) => Download
} = dual(2, (download: CoreDownload, wrap: Wrappers): Download => {
  const use = useHelper(download)

  return Download.of({
    cancel: use(() => download.cancel()),
    stream: use(() => download.createReadStream()).pipe(
      Effect.map((readable: AsyncIterable<string | Uint8Array>) => Stream.fromAsyncIterable(readable, wrapError)),
      Stream.unwrap,
      Stream.map(toUint8Array),
    ),
    delete: use(() => download.delete()),
    failure: use(() => download.failure()).pipe(Effect.map(Option.fromNullishOr)),
    page: () => wrap.page(download.page()),
    path: use(() => download.path()).pipe(Effect.map(Option.fromNullishOr)),
    saveAs: (path) => use(() => download.saveAs(path)),
    suggestedFilename: () => download.suggestedFilename(),
    url: () => download.url(),
    use,
  })
})
