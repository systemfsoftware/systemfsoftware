import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { checkStopEnrollment } from '@systemfsoftware/stop-enrollment'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { cleanupFixtures, writeFixture } from './__fixtures__/fixture-package.js'

const Feature = makeFeature({ it })

const MEDIUM_LINKED = writeFixture({
  prefix: 'stops-medium-linked-',
  name: '@systemfsoftware/medium-linked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Supervisor } from '@systemfsoftware/effect-daemon-spec'\ndeclare function build(): Supervisor.Medium.Medium<() => void>\nexport const LinkedMedium = build()\n",
    },
    {
      path: 'tests/medium.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { LinkedMedium } from '../src/mod.js'\nConformance.stopped(LinkedMedium)\n",
    },
  ],
})

const PRIVATE_BLUEPRINT_LINKED = writeFixture({
  prefix: 'stops-private-blueprint-',
  name: '@systemfsoftware/private-blueprint-linked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Blueprint } from '@systemfsoftware/effect-cell-types'\nconst WindowId: unique symbol = Symbol.for('test/Window')\nconst Window: Blueprint.Definition<typeof WindowId, { n: number }> = { typeId: WindowId, spec: { n: 1 } }\ndeclare function toBlueprint<T>(): T\nexport const make = (): Blueprint.Blueprint<typeof WindowId, { n: number }> => toBlueprint()\n",
    },
    {
      path: 'tests/window.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { make } from '../src/mod.js'\nConformance.stopped(make)\n",
    },
  ],
})

const PRIVATE_CELL_LINKED = writeFixture({
  prefix: 'stops-private-cell-',
  name: '@systemfsoftware/private-cell-linked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nconst hidden: Cell.Cell<number> = Cell.id<number>()\nexport const run = (input: number) => hidden.run(input)\n",
    },
    {
      path: 'tests/cell.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { run } from '../src/mod.js'\nConformance.stopped(run)\n",
    },
  ],
})

const CHAIN = writeFixture({
  prefix: 'stops-chain-',
  name: '@systemfsoftware/chain',
  files: [
    {
      path: 'src/leaf.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const leafCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/middle.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nimport { leafCell } from './leaf.js'\nexport const middleCell: Cell.Cell<number> = leafCell\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nimport { middleCell } from './middle.js'\nconst wiring = { middleCell }\nexport const topCell: Cell.Cell<number> = wiring.middleCell\n",
    },
    {
      path: 'tests/chain.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { topCell } from '../src/mod.js'\nConformance.stopped(topCell)\n",
    },
  ],
})

const SUBPATH = writeFixture({
  prefix: 'stops-subpath-',
  name: '@systemfsoftware/subpath',
  files: [
    {
      path: 'package.json',
      contents: JSON.stringify({
        name: '@systemfsoftware/subpath',
        type: 'module',
        exports: {
          '.': { '@systemfsoftware/source': './src/mod.ts' },
          './unit': { '@systemfsoftware/source': './src/unit.ts' },
        },
      }) + '\n',
    },
    {
      path: 'src/unit.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const subCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nimport { subCell } from '@systemfsoftware/subpath/unit'\nexport const top: Cell.Cell<number> = subCell\n",
    },
    {
      path: 'tests/sub.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { top } from '../src/mod.js'\nConformance.stopped(top)\n",
    },
  ],
})

const FIXTURES = [MEDIUM_LINKED, PRIVATE_BLUEPRINT_LINKED, PRIVATE_CELL_LINKED, CHAIN, SUBPATH]

afterAll(() => {
  cleanupFixtures(FIXTURES)
})

Feature('A stop rule reaches the unit it hands over, and the code that unit reaches')
  .live('each scenario opens a real TypeScript compiler session over fixture packages on disk')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A medium its own package stops is linked directly',
      Gherkin.Do.pipe(
        Given('a package whose medium its conformance test hands to a stop rule')(
          'pkg',
          () => Effect.succeed(MEDIUM_LINKED),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the medium is linked and nothing is named')((s, expect) =>
          expect({ unlinked: s.report.unlinked, linked: s.report.linked, direct: s.report.direct }).toEqual({
            unlinked: [],
            linked: 1,
            direct: 1,
          })
        ),
      ),
    )

    scenario(
      'A private definition behind an exported factory is linked with the factory',
      Gherkin.Do.pipe(
        Given('a package whose stop rule hands over the factory alone')(
          'pkg',
          () => Effect.succeed(PRIVATE_BLUEPRINT_LINKED),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the module that publishes the definition is linked')((s, expect) =>
          expect({ unlinked: s.report.unlinked, enrolled: s.report.enrolled, direct: s.report.direct }).toEqual({
            unlinked: [],
            enrolled: 1,
            direct: 1,
          })
        ),
      ),
    )

    scenario(
      'A private cell reached from a checked runner in the same module is linked directly',
      Gherkin.Do.pipe(
        Given('a package whose stop rule hands over a runner over a private cell')(
          'pkg',
          () => Effect.succeed(PRIVATE_CELL_LINKED),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the module is linked directly')((s, expect) =>
          expect({ unlinked: s.report.unlinked, direct: s.report.direct, transitive: s.report.transitive }).toEqual({
            unlinked: [],
            direct: 1,
            transitive: 0,
          })
        ),
      ),
    )

    scenario(
      'A unit reached through a chain of declarations within the package is linked',
      Gherkin.Do.pipe(
        Given('a package whose stop rule hands over the top of a three-module chain')(
          'pkg',
          () => Effect.succeed(CHAIN),
        ),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('every module of the chain is linked')((s, expect) =>
          expect({
            unlinked: s.report.unlinked,
            enrolled: s.report.enrolled,
            direct: s.report.direct,
            transitive: s.report.transitive,
          }).toEqual({ unlinked: [], enrolled: 3, direct: 1, transitive: 2 })
        ),
      ),
    )

    scenario(
      'A unit imported through a package subpath is linked',
      Gherkin.Do.pipe(
        Given('a package whose unit arrives through its own subpath export')('pkg', () => Effect.succeed(SUBPATH)),
        When('the check runs over it')('report', (s) => checkStopEnrollment({ packageRoot: s.pkg })),
        Then('the subpath module is linked through declarations')((s, expect) =>
          expect({ unlinked: s.report.unlinked, enrolled: s.report.enrolled, transitive: s.report.transitive }).toEqual(
            { unlinked: [], enrolled: 2, transitive: 1 },
          )
        ),
      ),
    )
  })
