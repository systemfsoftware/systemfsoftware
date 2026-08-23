import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { recipes } from '../src/index.js'
import { createCompilerHosts } from '../src/internal/MultiCompilerHost.js'

const Feature = makeFeature({ it, layer })

Feature('Compiler host program cache').body(({ scenario }) => {
  scenario(
    'Should_ReturnSameReference_When_SameRootRequested_And_Evict_When_CapacityExceeded',
    Gherkin.Do.pipe(
      Given('a package with at least three files')('pkg', () => Effect.sync(() => recipes.MultiEntrypoint())),
      When('the cache is exercised')(
        'result',
        ({ pkg }) =>
          Effect.gen(function*() {
            const hosts = yield* createCompilerHosts(pkg)
            const jsFiles = pkg.listFiles().filter((f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'))
            if (jsFiles.length < 3) {
              return yield* Effect.fail(new Error('recipe must produce at least three JS files'))
            }
            const [a, b, c] = jsFiles

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
