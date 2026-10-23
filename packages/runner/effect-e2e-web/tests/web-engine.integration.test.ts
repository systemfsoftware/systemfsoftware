import { web } from '@systemfsoftware/effect-e2e'
import { layer } from '@systemfsoftware/effect-e2e-web'
import {
  Engine,
  type EngineError,
  type EngineShape,
  type EnvironmentUnavailable,
  type Locator,
  LogEntry,
  type NthIndex,
  type ReadResult,
  type SemanticNode,
  type ViewportPoint,
} from '@systemfsoftware/effect-e2e/engine'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'

import {
  refusedOrigin,
  SECRET_HEADER,
  type SeenRequest,
  type WebSite,
  webSite,
} from './__fixtures__/web-site.fixture.js'

const Feature = makeFeature({ it })

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const chromium = (headers: Readonly<Record<string, string>> = {}): Layer.Layer<Engine, EnvironmentUnavailable> =>
  layer({
    spec: web({ browser: 'chromium' }),
    contextHeaders: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, Redacted.make(value)])),
  })

const byRole = (role: string, name: string, exact = true): Locator => ({
  expression: { kind: 'ByRole', role, name: { value: name, exact } },
  label: `the ${name} ${role}`,
})

const byTestId = (testId: string): Locator => ({ expression: { kind: 'ByTestId', testId }, label: testId })

const email = byRole('textbox', 'Email')
const agree = byRole('checkbox', 'Agree')
const note = byRole('textbox', 'Note')
const memo = byRole('textbox', 'Memo')
const plan: Locator = {
  expression: { kind: 'ByLabel', text: { value: 'Plan', exact: true } },
  label: 'the Plan select',
}

const selector = (css: string): Locator => ({ expression: { kind: 'Selector', css }, label: css })

const textOf = (text: string): Locator => ({
  expression: { kind: 'ByText', text: { value: text, exact: true } },
  label: text,
})

const nthOf = (locator: Locator, index: NthIndex): Locator => ({
  expression: { kind: 'Nth', inner: locator.expression, index },
  label: `${String(index)} of ${locator.label}`,
})

const onlyMatch = <E>(found: Effect.Effect<ReadonlyArray<SemanticNode>, E>) =>
  Effect.flatMap(found, (nodes) => Effect.fromOption(Arr.head(nodes)))

const centreOf = (node: SemanticNode): ViewportPoint =>
  Option.match(Option.fromNullishOr(node.bounds), {
    onNone: () => ({ x: 0, y: 0 }),
    onSome: (bounds) => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }),
  })

const summariesOf = (nodes: ReadonlyArray<SemanticNode>) =>
  nodes.map((node) => ({ role: node.role, name: node.name, text: node.text }))

const nodesIn = (tree: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  tree.flatMap((node) => [node, ...nodesIn(node.children)])

const evidenceIdsOf = (failure: EngineError): Array<string> =>
  failure.evidence.flatMap((evidence) => (Predicate.isTagged(evidence, 'NodeEvidence') ? [evidence.ref.id] : []))

const summaryOf = (tree: ReadonlyArray<SemanticNode>, role: string, name: string) =>
  nodesIn(tree)
    .filter((node) => node.role === role && node.name === name)
    .map((node) => ({ value: node.value, checked: node.states.checked, disabled: node.states.disabled }))

/** Runs `use` against a fresh Chromium engine over a fresh local site, both closed afterwards. */
const onSite = <A, E>(
  use: (engine: EngineShape, site: WebSite) => Effect.Effect<A, E>,
  headers: Readonly<Record<string, string>> = {},
): Effect.Effect<A, E | EnvironmentUnavailable> =>
  Effect.scoped(
    Effect.gen(function*() {
      const site = yield* webSite
      return yield* Effect.flatMap(Engine, (engine) => use(engine, site)).pipe(Effect.provide(chromium(headers)))
    }),
  )

const opened = (engine: EngineShape, site: WebSite) => engine.open(`${site.origin}/form`)

Feature('Driving a real browser through the web engine')
  .withLayer(Layer.empty)
  .live('every scenario launches Chromium against a node:http site on a loopback socket')
  .body(({ scenario }) => {
    scenario(
      'Opening a page reads its semantic tree and its route',
      Gherkin.Do.pipe(
        When('the order form is opened and observed')(
          'observed',
          () => onSite((engine, site) => Effect.andThen(opened(engine, site), engine.observe)),
        ),
        Then('the tree holds the empty Email box and the unchecked Agree box, at /form')((s, expect) =>
          expect({
            path: s.observed.route.path,
            email: summaryOf(s.observed.tree, 'textbox', 'Email'),
            agree: summaryOf(s.observed.tree, 'checkbox', 'Agree'),
            archive: summaryOf(s.observed.tree, 'button', 'Archive'),
          }).toEqual({
            path: '/form',
            email: [{ value: '', checked: undefined, disabled: false }],
            agree: [{ value: undefined, checked: false, disabled: false }],
            archive: [{ value: undefined, checked: undefined, disabled: true }],
          })
        ),
      ),
    )

    scenario(
      'Queries by role, name and test id find exactly what they name',
      Gherkin.Do.pipe(
        When('the form is queried by test id, by exact and loose names, and for two equal names')(
          'counts',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.all({
                  testId: Effect.map(engine.query(byTestId('submit-order')), (nodes) => nodes.map((node) => node.name)),
                  save: Effect.map(engine.query(byRole('button', 'Save')), (nodes) => nodes.length),
                  exactPrefix: Effect.map(engine.query(byRole('button', 'Sav')), (nodes) => nodes.length),
                  loose: Effect.map(engine.query(byRole('button', 'sav', false)), (nodes) => nodes.length),
                  deletes: Effect.map(
                    engine.query(byRole('button', 'Delete')),
                    (nodes) => new Set(nodes.map((node) => node.ref.id)).size,
                  ),
                }),
              )
            ),
        ),
        Then('each query matches its own elements, and the two Delete buttons carry distinct refs')((s, expect) =>
          expect(s.counts).toEqual({ testId: ['Place order'], save: 1, exactPrefix: 0, loose: 1, deletes: 2 })
        ),
      ),
    )

    scenario(
      'Filling and checking change what reads return',
      Gherkin.Do.pipe(
        When('Email is filled and Agree is checked')('reads', () =>
          onSite((engine, site) =>
            Effect.gen(function*() {
              yield* opened(engine, site)
              yield* engine.act({ _tag: 'Fill', target: email, value: 'ada@example.com' })
              yield* engine.act({ _tag: 'Check', target: agree, checked: true })
              return [
                yield* engine.read(email, { _tag: 'Value' }),
                yield* engine.read(agree, { _tag: 'Checked' }),
              ] satisfies ReadonlyArray<ReadResult>
            })
          )),
        Then('the reads return the filled address and the checked state')((s, expect) =>
          expect(s.reads).toEqual([{ _tag: 'Value', value: 'ada@example.com' }, { _tag: 'Checked', checked: true }])
        ),
      ),
    )

    scenario(
      'Tapping a link navigates, and the route keeps the query pairs in order',
      Gherkin.Do.pipe(
        When('the Next link is tapped')('route', () =>
          onSite((engine, site) =>
            Effect.andThen(
              Effect.andThen(opened(engine, site), engine.act({ _tag: 'Tap', target: byRole('link', 'Next') })),
              engine.route,
            )
          )),
        Then('the route is /next with tab=open then tab=all')((s, expect) =>
          expect({ path: s.route.path, query: s.route.query }).toEqual({
            path: '/next',
            query: [['tab', 'open'], ['tab', 'all']],
          })
        ),
      ),
    )

    scenario(
      'An ambiguous, a missing and a disabled target each fail with their own engine failure',
      Gherkin.Do.pipe(
        When('the test taps Delete, taps Nowhere and taps the disabled Archive')(
          'failures',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.all({
                  ambiguous: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Delete') })),
                  missing: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Nowhere') })),
                  disabled: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Archive') })),
                }),
              )
            ),
        ),
        Then('each failure is the engine code for what went wrong')((s, expect) =>
          expect({
            ambiguous: s.failures.ambiguous,
            missing: s.failures.missing,
            disabled: s.failures.disabled,
            missingNamesTheQuery: s.failures.missing.message.includes('Nowhere'),
          }).toMatchObject({
            ambiguous: { _tag: 'LOCATOR_AMBIGUOUS', evidence: [{ _tag: 'NodeEvidence' }, { _tag: 'NodeEvidence' }] },
            missing: { _tag: 'LOCATOR_NOT_FOUND' },
            disabled: { _tag: 'ACTION_FAILED', evidence: [{ _tag: 'NodeEvidence' }] },
            missingNamesTheQuery: true,
          })
        ),
      ),
    )

    scenario(
      'Each match stands for its own element, and failure evidence names nodes an observation holds',
      Gherkin.Do.pipe(
        When('the two inline totals are queried and tapped, Delete is tapped, and the page is observed')(
          'matched',
          () =>
            onSite((engine, site) =>
              Effect.gen(function*() {
                yield* opened(engine, site)
                const totals = yield* engine.query(byTestId('total'))
                const totalsTapped = yield* Effect.flip(engine.act({ _tag: 'Tap', target: byTestId('total') }))
                const deletesTapped = yield* Effect.flip(
                  engine.act({ _tag: 'Tap', target: byRole('button', 'Delete') }),
                )
                const observed = yield* engine.observe
                return {
                  totals: totals.map((node) => ({ text: node.text, boxed: node.bounds !== undefined })),
                  distinctTotals: Arr.dedupe(totals.map((node) => node.ref.id)).length,
                  totalsTapped,
                  distinctTotalEvidence: totalsTapped.pipe(evidenceIdsOf, Arr.dedupe).length,
                  deleteEvidence: evidenceIdsOf(deletesTapped).toSorted(),
                  observedDeletes: nodesIn(observed.tree)
                    .filter((node) => node.role === 'button' && node.name === 'Delete')
                    .map((node) => node.ref.id)
                    .toSorted(),
                }
              })
            ),
        ),
        Then('each total is its own boxed node, every evidence ref is distinct, and the Delete refs are observed')(
          (s, expect) =>
            expect(s.matched).toMatchObject({
              totals: [{ text: 'Subtotal', boxed: true }, { text: 'Total', boxed: true }],
              distinctTotals: 2,
              totalsTapped: { _tag: 'LOCATOR_AMBIGUOUS' },
              distinctTotalEvidence: 2,
              deleteEvidence: s.matched.observedDeletes,
            }),
        ),
      ),
    )

    scenario(
      'Every action reaches the page and leaves the effect it names',
      Gherkin.Do.pipe(
        When('each action is performed once on the controls page, then the page navigates on')(
          'performed',
          () =>
            onSite((engine, site) =>
              Effect.gen(function*() {
                yield* engine.open(`${site.origin}/controls`)
                yield* engine.act({ _tag: 'Type', target: note, text: 'hi' })
                yield* engine.act({ _tag: 'Press', target: note, key: 'Enter' })
                yield* engine.act({ _tag: 'Select', target: plan, option: { _tag: 'ByValue', value: 'pro' } })
                const byValue = yield* engine.read(plan, { _tag: 'Value' })
                yield* engine.act({ _tag: 'Select', target: plan, option: { _tag: 'ByLabel', label: 'Basic' } })
                const byLabel = yield* engine.read(plan, { _tag: 'Value' })
                yield* engine.act({ _tag: 'Hover', target: byRole('button', 'Hover me') })
                yield* engine.act({ _tag: 'Drag', from: byTestId('card'), to: selector('#bin') })
                const tapHere = yield* onlyMatch(engine.query(byRole('button', 'Tap here')))
                yield* engine.act({ _tag: 'TapAt', point: centreOf(tapHere) })
                const pad = centreOf(yield* onlyMatch(engine.query(selector('#pad'))))
                yield* engine.act({
                  _tag: 'SwipePath',
                  path: [{ x: pad.x - 40, y: pad.y }, { x: pad.x + 40, y: pad.y }],
                })
                const emptyPath = yield* Effect.flip(engine.act({ _tag: 'SwipePath', path: [] }))
                const memoBox = yield* onlyMatch(engine.query(memo))
                yield* engine.act({ _tag: 'TypeAt', point: centreOf(memoBox), text: 'xy' })
                yield* engine.act({ _tag: 'Swipe', direction: 'up', momentum: 'slow' })
                yield* engine.act({ _tag: 'WaitFor', locator: textOf('swiped;'), state: 'attached', timeout: 5_000 })
                const screenshotAction = yield* Effect.flip(engine.act({ _tag: 'Screenshot', label: 'controls' }))
                const reads = {
                  note: yield* engine.read(note, { _tag: 'Value' }),
                  memo: yield* engine.read(memo, { _tag: 'Value' }),
                  byValue,
                  byLabel,
                  events: yield* engine.read(byRole('list', 'Events'), { _tag: 'Text' }),
                }
                yield* engine.act({ _tag: 'Navigate', url: `${site.origin}/next` })
                const route = yield* engine.route
                return { reads, emptyPath, screenshotAction, path: route.path }
              })
            ),
        ),
        Then('every action left its effect, in order, and the two refusals carry their own codes')((s, expect) =>
          expect(s.performed).toMatchObject({
            reads: {
              note: { _tag: 'Value', value: 'hi' },
              memo: { _tag: 'Value', value: 'xy' },
              byValue: { _tag: 'Value', value: 'pro' },
              byLabel: { _tag: 'Value', value: 'basic' },
              events: { _tag: 'Text', text: 'pressed Enter;hovered;dropped;tapped;pad down;pad up;swiped;' },
            },
            emptyPath: { _tag: 'ACTION_FAILED' },
            screenshotAction: { _tag: 'AUTOMATION_UNSUPPORTED' },
            path: '/next',
          })
        ),
      ),
    )

    scenario(
      'Every locator kind finds exactly what it names, and a made-up role is refused',
      Gherkin.Do.pipe(
        When('the controls page is queried once with each locator kind')(
          'found',
          () =>
            onSite((engine, site) =>
              Effect.gen(function*() {
                yield* engine.open(`${site.origin}/controls`)
                const removes = byRole('button', 'Remove')
                const firstRemove = yield* onlyMatch(engine.query(nthOf(removes, 'first')))
                const lastRemove = yield* onlyMatch(engine.query(nthOf(removes, 'last')))
                const unknownRole = yield* Effect.flip(
                  engine.query({ expression: { kind: 'ByRole', role: 'not-a-role' }, label: 'a made-up role' }),
                )
                return {
                  byLabel: summariesOf(yield* engine.query(plan)),
                  byPlaceholder: summariesOf(
                    yield* engine.query({
                      expression: { kind: 'ByPlaceholder', text: { value: 'Write a note', exact: true } },
                      label: 'the note placeholder',
                    }),
                  ),
                  byText: summariesOf(yield* engine.query(textOf('Bin'))),
                  selector: (yield* engine.query(selector('#pad'))).length,
                  filter: summariesOf(
                    yield* engine.query({
                      expression: {
                        kind: 'Filter',
                        inner: { kind: 'ByRole', role: 'listitem' },
                        text: { value: 'Pear', exact: false },
                      },
                      label: 'the Pear row',
                    }),
                  ),
                  nthDistinct: Arr.dedupe([firstRemove.ref.id, lastRemove.ref.id]).length,
                  frame: summariesOf(
                    yield* engine.query({
                      expression: {
                        kind: 'Frame',
                        frame: 'iframe[title="Help"]',
                        inner: { kind: 'ByRole', role: 'button', name: { value: 'Help', exact: true } },
                      },
                      label: 'the Help button',
                    }),
                  ),
                  unknownRole,
                  unknownRoleNamed: unknownRole.message.includes('not-a-role'),
                }
              })
            ),
        ),
        Then('each kind finds its one element, the two Remove ends differ, and the made-up role is unsupported')((
          s,
          expect,
        ) =>
          expect(s.found).toMatchObject({
            byLabel: [{ role: 'combobox', name: 'Plan' }],
            byPlaceholder: [{ role: 'textbox', name: 'Note' }],
            byText: [{ text: 'Bin' }],
            selector: 1,
            filter: [{ role: 'listitem', text: 'Pear' }],
            nthDistinct: 2,
            frame: [{ role: 'button', name: 'Help' }],
            unknownRole: { _tag: 'AUTOMATION_UNSUPPORTED' },
            unknownRoleNamed: true,
          })
        ),
      ),
    )

    scenario(
      'Opening an address nothing serves fails as unreachable and leaves no page open',
      Gherkin.Do.pipe(
        Given('an origin that refuses connections')('origin', () => refusedOrigin),
        When('the engine opens it and then observes')('outcome', ({ origin }) =>
          onSite((engine) =>
            Effect.all({
              open: Effect.flip(engine.open(`${origin}/`)),
              observe: Effect.flip(engine.observe),
            })
          )),
        Then('the open fails APP_UNREACHABLE naming the address, and the observe APP_NOT_OPEN')((s, expect) =>
          expect({
            open: s.outcome.open._tag,
            namesTheAddress: s.outcome.open.message.includes(s.origin),
            observe: s.outcome.observe._tag,
          }).toEqual({ open: 'APP_UNREACHABLE', namesTheAddress: true, observe: 'APP_NOT_OPEN' })
        ),
      ),
    )

    scenario(
      'A secret fill is refused until the secret store can hand the engine its value',
      Gherkin.Do.pipe(
        When('the test fills Email with the secret "password"')(
          'failure',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.flip(engine.act({ _tag: 'Fill', target: email, value: { secret: 'password' } })),
              )
            ),
        ),
        Then('the fill fails AUTOMATION_UNSUPPORTED naming secret fills')((s, expect) =>
          expect({ tag: s.failure._tag, namesSecrets: s.failure.message.includes('secret') }).toEqual({
            tag: 'AUTOMATION_UNSUPPORTED',
            namesSecrets: true,
          })
        ),
      ),
    )

    scenario(
      'A screenshot masks its targets, even one that matches nothing, and returns a PNG',
      Gherkin.Do.pipe(
        When('a screenshot masks Email and Nowhere')(
          'png',
          () =>
            onSite((engine, site) =>
              Effect.andThen(opened(engine, site), engine.screenshot({ mask: [email, byRole('button', 'Nowhere')] }))
            ),
        ),
        Then('the bytes start with the PNG signature')((s, expect) =>
          expect(Array.from(s.png.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE)
        ),
      ),
    )

    scenario(
      'The console line and the missing stylesheet are in the logs once open returns',
      Gherkin.Do.pipe(
        When('the form is opened and its logs are read')(
          'logs',
          () =>
            onSite((engine, site) =>
              Effect.map(Effect.andThen(opened(engine, site), engine.logs), (logs) => ({ logs, origin: site.origin }))
            ),
        ),
        Then('they hold "form ready" and a 404 for /missing.css')((s, expect) =>
          expect({
            ready: s.logs.logs.filter(LogEntry.guards.Console).filter((entry) => entry.text === 'form ready').length,
            missing: s.logs.logs.filter(LogEntry.guards.Network),
          }).toEqual({
            ready: 1,
            missing: [{ _tag: 'Network', method: 'GET', url: `${s.logs.origin}/missing.css`, status: 404 }],
          })
        ),
      ),
    )

    scenario(
      'A context header reaches every request, and the engine writes it into none of its outputs',
      Gherkin.Do.pipe(
        Given('a secret header value')('secret', () => Effect.succeed(`s3cr3t-${crypto.randomUUID()}`)),
        When('a session observes, queries, fails, reads logs and the route, and fails to open an unserved address')(
          'session',
          ({ secret }) =>
            onSite(
              (engine, site) =>
                Effect.gen(function*() {
                  yield* opened(engine, site)
                  const outputs = [
                    yield* engine.observe,
                    yield* engine.query(byRole('button', 'Delete')),
                    yield* Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Delete') })),
                    yield* engine.logs,
                    yield* engine.route,
                    yield* Effect.flip(engine.open(`${yield* refusedOrigin}/`)),
                  ]
                  return { outputs: JSON.stringify(outputs), seen: yield* site.seen }
                }),
              { [SECRET_HEADER]: secret },
            ),
        ),
        Then('the page and its stylesheet carried the header, and no output holds its value')((s, expect) =>
          expect({
            carried: s.session.seen
              .filter((request: SeenRequest) => request.path === '/form' || request.path === '/style.css')
              .map((request: SeenRequest) => [request.path, request.secretHeader === s.secret]),
            leaked: s.session.outputs.includes(s.secret),
          }).toEqual({ carried: [['/form', true], ['/style.css', true]], leaked: false })
        ),
      ),
    )
  })
