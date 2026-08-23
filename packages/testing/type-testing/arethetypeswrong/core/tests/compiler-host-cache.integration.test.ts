import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { createPackageFromTarballData } from '../src/index.js'
import { createCompilerHosts } from '../src/internal/MultiCompilerHost.js'
import { readBytes } from './__fixtures__/fixture-io.mjs'

const Feature = makeFeature({ it, layer })

const fixturesDir = new URL('./__fixtures__/fixtures/', import.meta.url)
const urlOf = (dir: URL, name: string): URL => new URL(`./${name}`, dir)

Feature('Compiler host program cache').body(({ scenario }) => {
  scenario(
    'Should_ReturnSameReference_When_SameRootRequested_And_Evict_When_CapacityExceeded',
    Gherkin.Do.pipe(
      Given('a package with at least three files')(
        'pkg',
        () =>
          Effect.sync(() => {
            const bytes = readBytes(urlOf(fixturesDir, 'semver@7.6.3.tgz'))
            return createPackageFromTarballData(bytes)
          }),
      ),
      When('the cache is exercised')(
        'result',
        ({ pkg }) =>
          Effect.gen(function*() {
            const hosts = yield* createCompilerHosts(pkg)
            const allFiles = pkg.listFiles().filter((f) => f.endsWith('.js'))
            let a = ''
            let b = ''
            let c = ''
            if (allFiles.length >= 3) {
              const first = allFiles[0]
              const second = allFiles[1]
              const third = allFiles[2]
              a = first
              b = second
              c = third
            } else {
              a = '/index.js'
              b = '/preload.js'
              c = '/range.js'
            }

            const p1 = yield* hosts.node16.createAuxiliaryProgram([a])
            const p2 = yield* hosts.node16.createAuxiliaryProgram([a])
            const same = p1 === p2

            yield* hosts.node16.createAuxiliaryProgram([b])
            yield* hosts.node16.createAuxiliaryProgram([c])

            const p1Again = yield* hosts.node16.createAuxiliaryProgram([a])
            const evicted = p1Again !== p1

            return { same, evicted }
          }),
      ),
      Then('the same root returns the same reference and capacity 2 evicts LRU')(({ result }) =>
        Effect.gen(function*() {
          if (!result.same) {
            return yield* Effect.fail(new Error('expected same reference for same root'))
          }
          if (!result.evicted) {
            return yield* Effect.fail(new Error('expected eviction after capacity exceeded'))
          }
        })
      ),
    ),
  )
})
