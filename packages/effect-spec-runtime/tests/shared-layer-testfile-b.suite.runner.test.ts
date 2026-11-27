import { Suite } from '@systemfsoftware/effect-spec-runtime'
import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

import { FileFixture, fileLayer, runtimeTestFile } from './__fixtures__/file-fixture.fixture.js'

const thisFile = runtimeTestFile('tests/shared-layer-testfile-b.suite.runner.test.ts')

Suite.openShared(
  { it },
  { name: 'a second file reads its own path', describe: 'describe', options: undefined },
  { layer: fileLayer },
  (register) => {
    register(
      'the layer sees this second file, not the first',
      (expect) => Effect.flatMap(FileFixture, (fixture) => expect(fixture.file).toEqual(thisFile)),
      'run',
    )
  },
)
