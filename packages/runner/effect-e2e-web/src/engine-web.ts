import type { WebEngineSpec } from '@systemfsoftware/effect-e2e'
import type {
  EngineCapability,
  Locator as EngineLocator,
  LogEntry,
  Observation,
  ScreenshotRequest,
} from '@systemfsoftware/effect-e2e/engine'
import {
  AppNotOpen,
  ArtifactWriteFailed,
  type AutomationUnsupported,
  decodeObservation,
  Engine,
  EnvironmentUnavailable,
  SemanticNode,
} from '@systemfsoftware/effect-e2e/engine'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SynchronizedRef from 'effect/SynchronizedRef'
import { type Browser, chromium, firefox, type Page, webkit } from 'playwright'

import { actOn, located } from './actions.js'
import { semanticTreeOf } from './aria-tree.js'
import { unreachable } from './failure.js'
import { appended, consoleEntry, pageReportEntry, requestFailedEntry, responseEntries } from './logs.js'
import { PAGE_REPORT_BINDING, type PageReportSent, reportPage } from './page-reporter.js'
import { readOn } from './reads.js'
import { routeOf } from './route.js'
import { attempt, matchedAt, namingOf, type OpenSession, snapshotOf } from './session.js'

export const WEB_CAPABILITIES = ['web', 'screenshot', 'vision', 'network', 'drag', 'frames'] as const

const capabilitiesOf = (spec: WebEngineSpec): ReadonlyArray<EngineCapability> =>
  spec.browser === 'chromium' ? [...WEB_CAPABILITIES, 'navigation-timing'] : WEB_CAPABILITIES

export interface WebEngineOptions {
  readonly spec: WebEngineSpec
  readonly contextHeaders: Readonly<Record<string, Redacted.Redacted<string>>>
}

const ACTION_TIMEOUT_MS = 5_000

const NAVIGATION_TIMEOUT_MS = 30_000

const LAUNCHERS = { chromium, firefox, webkit } as const

type Session = Option.Option<OpenSession>

const notOpen = (): AppNotOpen =>
  new AppNotOpen({ message: 'no page is open', evidence: [{ _tag: 'LogEvidence', text: 'no page is open' }] })

const launchFailed = (spec: WebEngineSpec) => (reason: string): EnvironmentUnavailable =>
  new EnvironmentUnavailable({
    message:
      `the ${spec.browser} browser could not be launched (${reason}); install it with \`playwright install ${spec.browser}\``,
    evidence: [{ _tag: 'LogEvidence', text: reason }],
  })

const launched = (spec: WebEngineSpec): Effect.Effect<Browser, EnvironmentUnavailable> =>
  Effect.mapError(attempt(() => LAUNCHERS[spec.browser].launch({ headless: spec.headless })), launchFailed(spec))

const recordingInto = (logs: Ref.Ref<ReadonlyArray<LogEntry>>) => (entry: LogEntry): void =>
  Effect.runSync(Ref.update(logs, appended(entry)))

const listened = (page: Page, logs: Ref.Ref<ReadonlyArray<LogEntry>>): void => {
  const record = recordingInto(logs)
  page.on('console', (message) => record(consoleEntry({ type: message.type(), text: message.text() })))
  page.on('pageerror', (error) => record({ _tag: 'PageError', message: error.message }))
  page.on('requestfailed', (request) =>
    record(
      requestFailedEntry({
        method: request.method(),
        url: request.url(),
        failure: Option.getOrElse(Option.fromNullishOr(request.failure()?.errorText), () => 'failed'),
      }),
    ))
  page.on(
    'response',
    (response) =>
      responseEntries({ method: response.request().method(), url: response.url(), status: response.status() }).forEach(
        record,
      ),
  )
}

const closed = (session: Session): Effect.Effect<void> =>
  Option.match(session, {
    onNone: () => Effect.void,
    onSome: (open) => Effect.ignore(attempt(() => open.context.close())),
  })

const started =
  (browser: Browser, options: WebEngineOptions, snapshots: Ref.Ref<number>) =>
  (url: string): Effect.Effect<OpenSession, string> =>
    Effect.gen(function*() {
      const context = yield* attempt(() =>
        browser.newContext({ extraHTTPHeaders: Record.map(options.contextHeaders, Redacted.value) })
      )
      context.setDefaultTimeout(ACTION_TIMEOUT_MS)
      context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS)
      const logs = yield* Ref.make<ReadonlyArray<LogEntry>>([])
      const record = recordingInto(logs)
      yield* attempt(() =>
        context.exposeBinding(
          PAGE_REPORT_BINDING,
          (_source, report: PageReportSent | undefined) => record(pageReportEntry(report)),
        )
      )
      yield* attempt(() => context.addInitScript(reportPage))
      const page = yield* attempt(() => context.newPage())
      listened(page, logs)
      yield* attempt(() => page.goto(url)).pipe(Effect.tapError(() => Effect.ignore(attempt(() => context.close()))))
      return { context, page, logs, revision: yield* Ref.make(0), snapshots }
    })

const opening =
  (browser: Browser, options: WebEngineOptions, snapshots: Ref.Ref<number>, url: string) => (current: Session) =>
    closed(current).pipe(
      Effect.andThen(Effect.result(started(browser, options, snapshots)(url))),
      Effect.map((outcome) => [outcome, Result.getSuccess(outcome)] as const),
    )

const observed = (open: OpenSession): Effect.Effect<Observation> =>
  Effect.gen(function*() {
    const naming = yield* namingOf(open)
    const snapshot = yield* snapshotOf(open.page.locator('body'))
    return yield* decodeObservation({
      route: routeOf(open.page.url()),
      revision: naming.revision,
      tree: semanticTreeOf(naming)(snapshot),
    })
  }).pipe(Effect.orDie)

const matchedNodes = (open: OpenSession, target: EngineLocator) =>
  Effect.gen(function*() {
    const { locator } = yield* located(open)(target)
    const count = yield* attempt(() => locator.count()).pipe(Effect.orDie)
    const nodes = yield* Effect.forEach(
      Array.from({ length: count }, (_, index) => index),
      (index) => Effect.orDie(matchedAt({ open, locator })(index)),
    )
    return yield* Effect.orDie(Schema.decodeEffect(Schema.Array(SemanticNode))(nodes))
  })

const screenshotted = (open: OpenSession, request: ScreenshotRequest) =>
  Effect.gen(function*() {
    const masks = yield* Effect.forEach(
      request.mask,
      (mask) => Effect.map(located(open)(mask), ({ locator }) => locator),
    )
    const png = yield* attempt(() => open.page.screenshot({ type: 'png', mask: masks })).pipe(
      Effect.mapError((reason): ArtifactWriteFailed | AutomationUnsupported =>
        new ArtifactWriteFailed({
          message: `the screenshot could not be taken: ${reason}`,
          evidence: [{ _tag: 'LogEvidence', text: reason }],
        })
      ),
    )
    return new Uint8Array(png)
  })

/**
 * The web engine: one browser for the layer's lifetime, and a fresh browser context, carrying the
 * context headers, for every `open`. Closing the layer closes the browser.
 */
export const layer = (options: WebEngineOptions): Layer.Layer<Engine, EnvironmentUnavailable> =>
  Layer.effect(
    Engine,
    Effect.gen(function*() {
      const browser = yield* Effect.acquireRelease(launched(options.spec), (running) =>
        Effect.ignore(attempt(() => running.close())))
      const session = yield* SynchronizedRef.make<Session>(Option.none())
      const snapshots = yield* Ref.make(0)
      const opened = Effect.flatMap(SynchronizedRef.get(session), (current) =>
        Effect.fromOption(current)).pipe(
          Effect.mapError(notOpen),
        )
      return Engine.of({
        capabilities: capabilitiesOf(options.spec),
        open: (url) =>
          SynchronizedRef.modifyEffect(session, opening(browser, options, snapshots, url)).pipe(
            Effect.flatMap(Effect.fromResult),
            Effect.mapError(unreachable(url)),
            Effect.asVoid,
          ),
        observe: Effect.flatMap(opened, observed),
        query: (target) => Effect.flatMap(opened, (open) => matchedNodes(open, target)),
        act: (action) => Effect.flatMap(opened, (open) => actOn(open)(action)),
        read: (target, request) => Effect.flatMap(opened, (open) => readOn(open)(target, request)),
        screenshot: (request) => Effect.flatMap(opened, (open) => screenshotted(open, request)),
        route: Effect.map(opened, (open) => routeOf(open.page.url())),
        logs: Effect.flatMap(opened, (open) => Ref.get(open.logs)),
        close: SynchronizedRef.updateEffect(session, (current) => Effect.as(closed(current), Option.none())),
      })
    }),
  )
