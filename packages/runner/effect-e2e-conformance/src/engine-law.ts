import {
  AppNotOpen,
  AutomationUnsupported,
  decodeObservation,
  Engine,
  type EngineCapability,
  type EngineError,
  type EngineShape,
  type Locator,
  LocatorAmbiguous,
  LocatorNotFound,
  LogEntry,
  Observation,
  type SemanticNode,
} from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { LawCheck, LawVerdict } from './law-verdict.schema.js'

export const LawSite = {
  home: '/',
  form: '/form',
  linkFromHomeToForm: 'Form',
  emptyTextbox: 'Email',
  uncheckedCheckbox: 'Subscribe',
  button: 'Save',
  twoButtonsNamed: 'Delete',
  disabledButton: 'Archive',
  consoleTextOnFormOpen: 'form ready',
  assetAnsweringNotFoundOnFormOpen: '/missing.css',
} as const

export interface EngineSubject {
  readonly name: string
  readonly origin: string
  readonly layer: Layer.Layer<Engine>
}

export { LawVerdict }

interface Law {
  readonly name: string
  readonly check: (origin: string) => Effect.Effect<LawCheck, EngineError, Engine>
}

const FILLED = 'ada@example.com'
const MISSING = 'Nowhere'
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const compared = <A>(expected: A, observed: A): LawCheck => ({
  _tag: 'Compared',
  expected: JSON.stringify(expected),
  observed: JSON.stringify(observed),
})

const skipped = (reason: string): LawCheck => ({ _tag: 'Skipped', reason })

const at = (origin: string, path: string): string => new URL(path, origin).href

const byRole = (role: string, name: string, exact = true): Locator => ({
  expression: { kind: 'ByRole', role, name: { value: name, exact } },
  label: `the ${name} ${role}`,
})

const lastOf = (locator: Locator): Locator => ({
  expression: { kind: 'Nth', inner: locator.expression, index: 'last' },
  label: `the last of ${locator.label}`,
})

const firstOf = (locator: Locator): Locator => ({
  expression: { kind: 'Nth', inner: locator.expression, index: 'first' },
  label: `the first of ${locator.label}`,
})

const email = byRole('textbox', LawSite.emptyTextbox)
const subscribe = byRole('checkbox', LawSite.uncheckedCheckbox)
const save = byRole('button', LawSite.button)
const remove = byRole('button', LawSite.twoButtonsNamed)
const archive = byRole('button', LawSite.disabledButton)
const missing = byRole('button', MISSING)

const opened = (origin: string, path: string): Effect.Effect<EngineShape, EngineError, Engine> =>
  Effect.tap(Engine, (engine) => engine.open(at(origin, path)))

const nodesIn = (tree: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  tree.flatMap((node) => [node, ...nodesIn(node.children)])

const summaryOf = (tree: ReadonlyArray<SemanticNode>, role: string, name: string) =>
  Option.match(Arr.findFirst(nodesIn(tree), (node) => node.role === role && node.name === name), {
    onNone: () => 'missing',
    onSome: (node) => ({
      disabled: node.states.disabled,
      checked: Option.getOrNull(Option.fromNullishOr(node.states.checked)),
    }),
  })

const redecodes = (observation: Observation): Effect.Effect<boolean> =>
  Schema.encodeEffect(Observation)(observation).pipe(
    Effect.flatMap(decodeObservation),
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  )

const outcomeOf = <A, E extends EngineError>(
  effect: Effect.Effect<A, E>,
  describe: (failure: E) => string,
): Effect.Effect<string> =>
  Effect.map(Effect.result(effect), Result.match({ onSuccess: () => 'succeeded', onFailure: describe }))

const naming = (word: string) => (failure: EngineError): boolean =>
  Schema.is(AutomationUnsupported)(failure) && failure.message.includes(word)

const refusalNaming = (word: string) => (failure: EngineError): string =>
  naming(word)(failure) ? `unsupported, naming ${word}` : JSON.stringify(failure)

const ambiguity = (failure: EngineError): string =>
  Schema.is(LocatorAmbiguous)(failure) ? `ambiguous between ${failure.evidence.length}` : JSON.stringify(failure)

const namesMissing = (failure: EngineError): boolean =>
  Schema.is(LocatorNotFound)(failure) && failure.message.includes(MISSING)

const absence = (failure: EngineError): string =>
  namesMissing(failure) ? `not found, naming ${MISSING}` : JSON.stringify(failure)

const notOpen = (
  failure: EngineError,
): string => (Schema.is(AppNotOpen)(failure) ? 'not open' : JSON.stringify(failure))

const declares = (engine: EngineShape, capability: EngineCapability): boolean =>
  engine.capabilities.includes(capability)

const answeredNotFound = (entry: { readonly status: number; readonly url: string }): boolean =>
  entry.status === 404 && entry.url.endsWith(LawSite.assetAnsweringNotFoundOnFormOpen)

const isMissingAsset = (entry: LogEntry): boolean => LogEntry.guards.Network(entry) && answeredNotFound(entry)

const isReadyText = (entry: LogEntry): boolean =>
  LogEntry.guards.Console(entry) && entry.text === LawSite.consoleTextOnFormOpen

const networkEvidence = (engine: EngineShape, logs: ReadonlyArray<LogEntry>): boolean | string =>
  declares(engine, 'network') ? logs.some(isMissingAsset) : 'not declared'

const screenshotOutcome = (engine: EngineShape): Effect.Effect<ReadonlyArray<number> | string> =>
  declares(engine, 'screenshot')
    ? Effect.match(engine.screenshot({ mask: [email, missing] }), {
      onFailure: (failure) => JSON.stringify(failure),
      onSuccess: (bytes) => Array.from(bytes.slice(0, PNG_SIGNATURE.length)),
    })
    : outcomeOf(engine.screenshot({ mask: [email, missing] }), refusalNaming('screenshot'))

const screenshotExpectation = (engine: EngineShape): ReadonlyArray<number> | string =>
  declares(engine, 'screenshot') ? PNG_SIGNATURE : 'unsupported, naming screenshot'

const reopenedPath = (engine: EngineShape, origin: string): Effect.Effect<string> =>
  engine.open(at(origin, LawSite.home)).pipe(
    Effect.andThen(engine.route),
    Effect.match({ onFailure: (failure) => JSON.stringify(failure), onSuccess: (route) => route.path }),
  )

const laws: ReadonlyArray<Law> = [
  {
    name: 'route-after-open',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        const route = yield* engine.route
        return compared(
          { origin: new URL(origin).origin, path: LawSite.form },
          { origin: route.origin, path: route.path },
        )
      }),
  },
  {
    name: 'observe-tree',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        const observation = yield* engine.observe
        return compared(
          {
            path: LawSite.form,
            email: { disabled: false, checked: null },
            subscribe: { disabled: false, checked: false },
            save: { disabled: false, checked: null },
            archive: { disabled: true, checked: null },
            redecodes: true,
          },
          {
            path: observation.route.path,
            email: summaryOf(observation.tree, 'textbox', LawSite.emptyTextbox),
            subscribe: summaryOf(observation.tree, 'checkbox', LawSite.uncheckedCheckbox),
            save: summaryOf(observation.tree, 'button', LawSite.button),
            archive: summaryOf(observation.tree, 'button', LawSite.disabledButton),
            redecodes: yield* redecodes(observation),
          },
        )
      }),
  },
  {
    name: 'query-role-name',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        const first = yield* engine.query(firstOf(remove))
        const last = yield* engine.query(lastOf(remove))
        return compared(
          { save: 1, remove: 2, missing: 0, loose: 1, exactPrefix: 0, lastOfRemove: 1, distinctEnds: true },
          {
            save: (yield* engine.query(save)).length,
            remove: (yield* engine.query(remove)).length,
            missing: (yield* engine.query(missing)).length,
            loose: (yield* engine.query(byRole('button', 'sav', false))).length,
            exactPrefix: (yield* engine.query(byRole('button', 'Sav'))).length,
            lastOfRemove: last.length,
            distinctEnds: JSON.stringify(first.map((node) =>
              node.ref
            )) !== JSON.stringify(last.map((node) => node.ref)),
          },
        )
      }),
  },
  {
    name: 'fill-then-read',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        yield* engine.act({ _tag: 'Fill', target: email, value: FILLED })
        return compared({ _tag: 'Value', value: FILLED }, yield* engine.read(email, { _tag: 'Value' }))
      }),
  },
  {
    name: 'tap-checkbox',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        yield* engine.act({ _tag: 'Tap', target: subscribe })
        const afterFirst = yield* engine.read(subscribe, { _tag: 'Checked' })
        yield* engine.act({ _tag: 'Tap', target: subscribe })
        const afterSecond = yield* engine.read(subscribe, { _tag: 'Checked' })
        return compared(
          [{ _tag: 'Checked', checked: true }, { _tag: 'Checked', checked: false }],
          [afterFirst, afterSecond],
        )
      }),
  },
  {
    name: 'tap-link-navigates',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.home)
        yield* engine.act({ _tag: 'Tap', target: byRole('link', LawSite.linkFromHomeToForm) })
        return compared(LawSite.form, (yield* engine.route).path)
      }),
  },
  {
    name: 'screenshot-masks-without-requiring-a-match',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        return compared(screenshotExpectation(engine), yield* screenshotOutcome(engine))
      }),
  },
  {
    name: 'drag-capability',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        return declares(engine, 'drag')
          ? skipped('the engine declares drag, so this law cannot refuse it')
          : compared(
            'unsupported, naming drag',
            yield* outcomeOf(engine.act({ _tag: 'Drag', from: save, to: archive }), refusalNaming('drag')),
          )
      }),
  },
  {
    name: 'logs-hold-load-evidence-once-open-returns',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        const logs = yield* engine.logs
        return compared(
          { console: true, notFound: declares(engine, 'network') || 'not declared' },
          { console: logs.some(isReadyText), notFound: networkEvidence(engine, logs) },
        )
      }),
  },
  {
    name: 'ambiguous-locator',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        return compared('ambiguous between 2', yield* outcomeOf(engine.act({ _tag: 'Tap', target: remove }), ambiguity))
      }),
  },
  {
    name: 'missing-locator',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        return compared(
          `not found, naming ${MISSING}`,
          yield* outcomeOf(engine.act({ _tag: 'Tap', target: missing }), absence),
        )
      }),
  },
  {
    name: 'close-ends-session-and-open-starts-fresh',
    check: (origin) =>
      Effect.gen(function*() {
        const engine = yield* opened(origin, LawSite.form)
        yield* engine.close
        const afterClose = yield* outcomeOf(engine.observe, notOpen)
        return compared(
          { afterClose: 'not open', reopened: LawSite.home },
          { afterClose, reopened: yield* reopenedPath(engine, origin) },
        )
      }),
  },
]

const judged = (law: string) => (check: LawCheck): LawVerdict =>
  LawCheck.match(check, {
    Compared: ({ expected, observed }): LawVerdict =>
      expected === observed ? { _tag: 'LawHeld', law } : { _tag: 'LawBroken', law, expected, observed },
    Skipped: ({ reason }): LawVerdict => ({ _tag: 'LawSkipped', law, reason }),
  })

const verdictOf = (subject: EngineSubject) => (law: Law): Effect.Effect<LawVerdict> =>
  law.check(subject.origin).pipe(
    Effect.map(judged(law.name)),
    Effect.provide(subject.layer),
    Effect.catchCause((cause) =>
      Effect.succeed<LawVerdict>({
        _tag: 'LawBroken',
        law: law.name,
        expected: 'the law to run without an engine failure',
        observed: Cause.pretty(cause),
      })
    ),
  )

export const prove = (subject: EngineSubject): Effect.Effect<ReadonlyArray<LawVerdict>> =>
  Effect.forEach(laws, verdictOf(subject))
