import type { LocatorExpression, NthIndex, TextPattern } from '@systemfsoftware/effect-e2e/engine'
import { AutomationUnsupported } from '@systemfsoftware/effect-e2e/engine'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type { FrameLocator, Locator, Page } from 'playwright'

type Scope = Page | FrameLocator

type AriaRole = Parameters<Page['getByRole']>[0]

const ARIA_ROLES: Readonly<Record<AriaRole, true>> = {
  alert: true,
  alertdialog: true,
  application: true,
  article: true,
  banner: true,
  blockquote: true,
  button: true,
  caption: true,
  cell: true,
  checkbox: true,
  code: true,
  columnheader: true,
  combobox: true,
  complementary: true,
  contentinfo: true,
  definition: true,
  deletion: true,
  dialog: true,
  directory: true,
  document: true,
  emphasis: true,
  feed: true,
  figure: true,
  form: true,
  generic: true,
  grid: true,
  gridcell: true,
  group: true,
  heading: true,
  img: true,
  insertion: true,
  link: true,
  list: true,
  listbox: true,
  listitem: true,
  log: true,
  main: true,
  marquee: true,
  math: true,
  meter: true,
  menu: true,
  menubar: true,
  menuitem: true,
  menuitemcheckbox: true,
  menuitemradio: true,
  navigation: true,
  none: true,
  note: true,
  option: true,
  paragraph: true,
  presentation: true,
  progressbar: true,
  radio: true,
  radiogroup: true,
  region: true,
  row: true,
  rowgroup: true,
  rowheader: true,
  scrollbar: true,
  search: true,
  searchbox: true,
  separator: true,
  slider: true,
  spinbutton: true,
  status: true,
  strong: true,
  subscript: true,
  superscript: true,
  switch: true,
  tab: true,
  table: true,
  tablist: true,
  tabpanel: true,
  term: true,
  textbox: true,
  time: true,
  timer: true,
  toolbar: true,
  tooltip: true,
  tree: true,
  treegrid: true,
  treeitem: true,
}

const isAriaRole = (role: string): role is AriaRole => Object.hasOwn(ARIA_ROLES, role)

type Mapped = Result.Result<Locator, AutomationUnsupported>

const unknownRole = (role: string): AutomationUnsupported =>
  new AutomationUnsupported({
    message: `the web engine cannot locate by the role "${role}", which is not an ARIA role`,
    evidence: [{ _tag: 'LogEvidence', text: role }],
  })

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

const wholeText = (pattern: TextPattern): string | RegExp =>
  pattern.exact ? new RegExp(`^\\s*${escaped(pattern.value)}\\s*$`, 'u') : pattern.value

const nth = (index: NthIndex) => (locator: Locator): Locator =>
  Match.value(index).pipe(
    Match.when('first', () => locator.first()),
    Match.when('last', () => locator.last()),
    Match.orElse((at) => locator.nth(at)),
  )

const named = (scope: Scope, role: AriaRole, name: TextPattern | undefined): Locator =>
  name === undefined ? scope.getByRole(role) : scope.getByRole(role, { name: name.value, exact: name.exact })

const byRole = (scope: Scope, role: string, name: TextPattern | undefined): Mapped =>
  isAriaRole(role) ? Result.succeed(named(scope, role, name)) : Result.fail(unknownRole(role))

/** The Playwright locator for an engine locator expression, resolved within a page or a frame. */
export const playwrightLocator = (scope: Scope) => (expression: LocatorExpression): Mapped =>
  Match.value(expression).pipe(
    Match.discriminatorsExhaustive('kind')({
      ByRole: ({ role, name }) => byRole(scope, role, name),
      ByLabel: ({ text }) => Result.succeed(scope.getByLabel(text.value, { exact: text.exact })),
      ByPlaceholder: ({ text }) => Result.succeed(scope.getByPlaceholder(text.value, { exact: text.exact })),
      ByText: ({ text }) => Result.succeed(scope.getByText(text.value, { exact: text.exact })),
      ByTestId: ({ testId }) => Result.succeed(scope.getByTestId(testId)),
      Selector: ({ css }) => Result.succeed(scope.locator(css)),
      Filter: ({ inner, text }) =>
        Result.map(playwrightLocator(scope)(inner), (located) => located.filter({ hasText: wholeText(text) })),
      Nth: ({ inner, index }) => Result.map(playwrightLocator(scope)(inner), nth(index)),
      Frame: ({ inner, frame }) => playwrightLocator(scope.frameLocator(frame))(inner),
    }),
  )
