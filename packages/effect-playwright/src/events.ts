import { Effect, Queue, Stream } from 'effect'
import { dual } from 'effect/Function'
import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Dialog,
  Download,
  FileChooser,
  Frame,
  Page,
  Request,
  Response,
  WebError,
  WebSocket,
  Worker,
} from 'playwright-core'

export interface PageEvents {
  readonly close: Page
  readonly console: ConsoleMessage
  readonly crash: Page
  readonly dialog: Dialog
  readonly domcontentloaded: Page
  readonly download: Download
  readonly filechooser: FileChooser
  readonly frameattached: Frame
  readonly framedetached: Frame
  readonly framenavigated: Frame
  readonly load: Page
  readonly pageerror: Error
  readonly popup: Page
  readonly request: Request
  readonly requestfailed: Request
  readonly requestfinished: Request
  readonly response: Response
  readonly websocket: WebSocket
  readonly worker: Worker
}

export interface BrowserContextEvents {
  readonly close: BrowserContext
  readonly console: ConsoleMessage
  readonly dialog: Dialog
  readonly download: Download
  readonly frameattached: Frame
  readonly framedetached: Frame
  readonly framenavigated: Frame
  readonly page: Page
  readonly pageclose: Page
  readonly pageload: Page
  readonly request: Request
  readonly requestfailed: Request
  readonly requestfinished: Request
  readonly response: Response
  readonly serviceworker: Worker
  readonly weberror: WebError
}

export interface BrowserEvents {
  readonly context: BrowserContext
  readonly disconnected: Browser
}

interface Emitter<Events> {
  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): void
  off<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): void
  once<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): void
}

const asEmitter = <Target, Events>(target: Target): Target & Emitter<Events> =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- playwright-core types on/off/once as one overload per event name, which a generic event key cannot select
  target as Target & Emitter<Events>

const until = <Events, K extends keyof Events>(
  source: Emitter<Events>,
  event: K,
  end: keyof Events,
  endedAlready: () => boolean,
): Stream.Stream<Events[K]> =>
  Stream.callback<Events[K]>((queue) => {
    const emit = (value: Events[K]) => {
      Queue.offerUnsafe(queue, value)
    }
    const finish = () => {
      Queue.endUnsafe(queue)
    }
    return Effect.acquireRelease(
      Effect.sync(() => {
        source.on(event, emit)
        source.once(end, finish)
        if (endedAlready()) {
          finish()
        }
      }),
      () =>
        Effect.sync(() => {
          source.off(event, emit)
          source.off(end, finish)
        }),
    )
  })

export const pageEvents: {
  <K extends keyof PageEvents>(event: K): (page: Page) => Stream.Stream<PageEvents[K]>
  <K extends keyof PageEvents>(page: Page, event: K): Stream.Stream<PageEvents[K]>
} = dual(
  2,
  <K extends keyof PageEvents>(page: Page, event: K): Stream.Stream<PageEvents[K]> =>
    until(asEmitter<Page, PageEvents>(page), event, 'close', () => page.isClosed()),
)

export const browserContextEvents: {
  <K extends keyof BrowserContextEvents>(event: K): (context: BrowserContext) => Stream.Stream<BrowserContextEvents[K]>
  <K extends keyof BrowserContextEvents>(context: BrowserContext, event: K): Stream.Stream<BrowserContextEvents[K]>
} = dual(
  2,
  <K extends keyof BrowserContextEvents>(context: BrowserContext, event: K): Stream.Stream<BrowserContextEvents[K]> =>
    until(asEmitter<BrowserContext, BrowserContextEvents>(context), event, 'close', () => context.isClosed()),
)

export const browserEvents: {
  <K extends keyof BrowserEvents>(event: K): (browser: Browser) => Stream.Stream<BrowserEvents[K]>
  <K extends keyof BrowserEvents>(browser: Browser, event: K): Stream.Stream<BrowserEvents[K]>
} = dual(
  2,
  <K extends keyof BrowserEvents>(browser: Browser, event: K): Stream.Stream<BrowserEvents[K]> =>
    until(asEmitter<Browser, BrowserEvents>(browser), event, 'disconnected', () => !browser.isConnected()),
)
