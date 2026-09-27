import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { checkStopEnrollment, renderReport } from '@systemfsoftware/stop-enrollment'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { cleanupFixtures, writeFixture } from './__fixtures__/fixture-package.js'

const Feature = makeFeature({ it })

const MEDIUM_UNLINKED = writeFixture({
  prefix: 'stops-medium-unlinked-',
  name: '@systemfsoftware/medium-unlinked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Supervisor } from '@systemfsoftware/effect-daemon-spec'\ndeclare function build(): Supervisor.Medium.Medium<() => void>\nexport const UnlinkedMedium = build()\n",
    },
  ],
})

const CELLS = writeFixture({
  prefix: 'stops-cells-',
  name: '@systemfsoftware/cells',
  files: [
    {
      path: 'src/sandwich.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport type WrittenCell<I, A> = Cell.Cell<I> & { readonly phases: readonly string[]; readonly response: A }\nexport const chain: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nimport type { WrittenCell } from './sandwich.js'\ndeclare function build<T>(): T\nexport const SandwichCell: WrittenCell<number, string> = build()\nexport const CombinatorCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/positive.ts',
      contents:
        "import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'\ndeclare const read: (command: number) => number\ndeclare const workflow: unknown\ndeclare const handlers: object\nexport const SandwichBuilt = Sandwich.named('op')(read).decide(workflow).write(handlers)\nexport const makeCell = (): Cell.Cell<number> => Cell.id<number>()\n",
    },
  ],
})

const BLUEPRINT_NOT_SUFFIXED = writeFixture({
  prefix: 'stops-blueprint-',
  name: '@systemfsoftware/blueprint-not-suffixed',
  files: [
    {
      path: 'src/anything.ts',
      contents:
        "import { Blueprint } from '@systemfsoftware/effect-cell-types'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\ndeclare function build<T>(): T\nexport const Widget: Blueprint.Blueprint<typeof WidgetId, { n: number }> = build()\n",
    },
  ],
})

const WRONG_EXPORT = writeFixture({
  prefix: 'stops-wrong-export-',
  name: '@systemfsoftware/wrong-export',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const WrongCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    { path: 'src/other.ts', contents: 'export const other = 1\n' },
    {
      path: 'tests/other.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { other } from '../src/other.js'\nConformance.stopped(other)\n",
    },
  ],
})

const STOP_OUTSIDE = writeFixture({
  prefix: 'stops-outside-',
  name: '@systemfsoftware/stop-outside',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const LooseCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'tests/loose.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { LooseCell } from '../src/mod.js'\nConformance.stopped(LooseCell)\n",
    },
  ],
})

const NO_UNITS = writeFixture({
  prefix: 'stops-no-units-',
  name: '@systemfsoftware/no-units',
  testScript: 'vitest run --project unit',
  files: [{ path: 'src/mod.ts', contents: 'export const answer = 42\n' }],
})

const IMPORTED_UNUSED = writeFixture({
  prefix: 'stops-imported-unused-',
  name: '@systemfsoftware/imported-unused',
  files: [
    {
      path: 'src/private.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const unusedCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Blueprint } from '@systemfsoftware/effect-cell-types'\nimport { unusedCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint.Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { Widget }\n",
    },
    {
      path: 'tests/imported.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",
    },
  ],
})

const PUB_PRIVATE = writeFixture({
  prefix: 'stops-pub-private-',
  name: '@systemfsoftware/pub-private',
  testScript: 'vitest run --project unit',
  files: [
    {
      path: 'src/private.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Blueprint, Cell } from '@systemfsoftware/effect-cell-types'\nimport { hiddenCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst cell: Cell.Cell<number> = hiddenCell\nconst Widget: Blueprint.Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { cell, Widget }\n",
    },
    {
      path: 'tests/pub.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",
    },
  ],
})

const PUB_TYPE_ONLY = writeFixture({
  prefix: 'stops-pub-type-only-',
  name: '@systemfsoftware/pub-type-only',
  files: [
    {
      path: 'src/private.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Blueprint } from '@systemfsoftware/effect-cell-types'\nimport type { hiddenCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint.Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport type Hidden = typeof hiddenCell\nexport { Widget }\n",
    },
    {
      path: 'tests/pub.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",
    },
  ],
})

const ORPHAN_PRIVATE = writeFixture({
  prefix: 'stops-orphan-private-',
  name: '@systemfsoftware/orphan-private',
  testScript: 'vitest run --project unit --project conformance',
  files: [
    {
      path: 'src/private.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Blueprint } from '@systemfsoftware/effect-cell-types'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint.Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { Widget }\n",
    },
    {
      path: 'tests/pub.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",
    },
  ],
})

const OTHER_UNITS = writeFixture({
  prefix: 'stops-other-units-',
  name: '@systemfsoftware/other-units',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const otherCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
  ],
})

const DECLARATION_ONLY = writeFixture({
  prefix: 'stops-declaration-only-',
  name: '@systemfsoftware/declaration-only',
  declarationKinds: true,
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const DeclaredCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
  ],
})

const FIXTURES = [
  MEDIUM_UNLINKED,
  CELLS,
  BLUEPRINT_NOT_SUFFIXED,
  WRONG_EXPORT,
  STOP_OUTSIDE,
  NO_UNITS,
  IMPORTED_UNUSED,
  PUB_PRIVATE,
  PUB_TYPE_ONLY,
  ORPHAN_PRIVATE,
  OTHER_UNITS,
  DECLARATION_ONLY,
]

afterAll(() => {
  cleanupFixtures(FIXTURES)
})

Feature('A unit no stop rule reaches is named, and nothing else is enrolled')
  .live('each scenario opens a real TypeScript compiler session over fixture packages on disk')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A medium no stop rule reaches is named with every declaration the module publishes',
      Gherkin.Do.pipe(
        Given('a package whose medium nothing stops')('pkg', () => Effect.succeed(MEDIUM_UNLINKED)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the medium module is named, its builder included')((s, expect) =>
          expect(renderReport(s.report)).toEqual([
            'src/mod.ts: has no stop rule (build, UnlinkedMedium)',
            'stop enrollment: 1 enrolled module(s), 0 with a stop rule (0 linked directly, 0 reached through declarations)',
          ])
        ),
      ),
    )

    scenario(
      'A Sandwich-built cell and a combinator-built cell are both enrolled',
      Gherkin.Do.pipe(
        Given('a package of cells built both ways, and a kind module beside them')(
          'pkg',
          () => Effect.succeed(CELLS),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('each unit module is named and the kind module is not')((s, expect) =>
          expect(renderReport(s.report)).toEqual([
            'src/mod.ts: has no stop rule (SandwichCell, CombinatorCell)',
            'src/positive.ts: has no stop rule (SandwichBuilt, makeCell)',
            'stop enrollment: 2 enrolled module(s), 0 with a stop rule (0 linked directly, 0 reached through declarations)',
          ])
        ),
      ),
    )

    scenario(
      'A Blueprint declared outside any kind-suffixed file is enrolled',
      Gherkin.Do.pipe(
        Given('a package whose blueprint lives in a file named for nothing')(
          'pkg',
          () => Effect.succeed(BLUEPRINT_NOT_SUFFIXED),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the blueprint module is named')((s, expect) =>
          expect(renderReport(s.report)).toEqual([
            'src/anything.ts: has no stop rule (Widget)',
            'stop enrollment: 1 enrolled module(s), 0 with a stop rule (0 linked directly, 0 reached through declarations)',
          ])
        ),
      ),
    )

    scenario(
      'A stop rule that hands over another module leaves its unit unlinked',
      Gherkin.Do.pipe(
        Given('a package whose conformance test stops a different export')(
          'pkg',
          () => Effect.succeed(WRONG_EXPORT),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the cell module is named')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/mod.ts: has no stop rule (WrongCell)',
          ])
        ),
      ),
    )

    scenario(
      'A stop call outside a conformance test file does not link',
      Gherkin.Do.pipe(
        Given('a package whose stop call sits in an ordinary test')('pkg', () => Effect.succeed(STOP_OUTSIDE)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the cell module is named')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/mod.ts: has no stop rule (LooseCell)',
          ])
        ),
      ),
    )

    scenario(
      'A package with no units passes with nothing enrolled',
      Gherkin.Do.pipe(
        Given('a package that declares no unit at all')('pkg', () => Effect.succeed(NO_UNITS)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the report names nothing and enrolls nothing')((s, expect) =>
          expect({ unlinked: s.report.unlinked, enrolled: s.report.enrolled }).toEqual({ unlinked: [], enrolled: 0 })
        ),
      ),
    )

    scenario(
      'An imported unit no reached declaration names is unlinked',
      Gherkin.Do.pipe(
        Given('a package that imports a unit it never uses')('pkg', () => Effect.succeed(IMPORTED_UNUSED)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('only the unused unit is named')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/private.ts: has no stop rule (unusedCell)',
          ])
        ),
      ),
    )

    scenario(
      'A type-only import never links, and a test script that skips the conformance project is named',
      Gherkin.Do.pipe(
        Given('a package whose only reference to a unit is a type')('pkg', () => Effect.succeed(PUB_TYPE_ONLY)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the unit is unlinked')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/private.ts: has no stop rule (hiddenCell)',
          ])
        ),
      ),
    )

    scenario(
      'A linked stop rule whose test script never runs the conformance project is named',
      Gherkin.Do.pipe(
        Given('a package whose test script names one project only')('pkg', () => Effect.succeed(PUB_PRIVATE)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the package is unrouted beside the unit it never linked')((s, expect) =>
          expect(renderReport(s.report)).toEqual([
            'src/private.ts: has no stop rule (hiddenCell)',
            '@systemfsoftware/pub-private: its test script never runs the conformance project',
            'stop enrollment: 2 enrolled module(s), 1 with a stop rule (1 linked directly, 0 reached through declarations)',
          ])
        ),
      ),
    )

    scenario(
      'A test script that runs the conformance project is not named',
      Gherkin.Do.pipe(
        Given('a package whose test script runs both projects')('pkg', () => Effect.succeed(ORPHAN_PRIVATE)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('no unrouted package is reported')((s, expect) =>
          expect({ unrouted: s.report.unrouted, unlinked: s.report.unlinked.map((f) => f.message) }).toEqual({
            unrouted: [],
            unlinked: ['src/private.ts: has no stop rule (hiddenCell)'],
          })
        ),
      ),
    )

    scenario(
      'A unit another package exports stays unlinked in the package that declares it',
      Gherkin.Do.pipe(
        Given('a package of one cell that nothing in it stops')('pkg', () => Effect.succeed(OTHER_UNITS)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the cell module is named')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/mod.ts: has no stop rule (otherCell)',
          ])
        ),
      ),
    )

    scenario(
      'Kinds that resolve to declaration files alone still enroll',
      Gherkin.Do.pipe(
        Given('a consumer package whose kinds arrive as published declarations')(
          'pkg',
          () => Effect.succeed(DECLARATION_ONLY),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the cell is enrolled and named')((s, expect) =>
          expect(s.report.unlinked.map((finding) => finding.message)).toEqual([
            'src/mod.ts: has no stop rule (DeclaredCell)',
          ])
        ),
      ),
    )
  })
