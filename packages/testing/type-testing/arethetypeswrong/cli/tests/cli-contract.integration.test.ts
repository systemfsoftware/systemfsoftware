import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { Container, ContainerLive, fixtureDir, WORKDIR } from './__fixtures__/ContainerAdapter.js'

const Feature = makeFeature({ it, layer })

const fixture = (name: string): string => `${WORKDIR}/fixtures/${name}.tgz`

Feature('Analyzing published packages with the installed binary')
  .withLayer(ContainerLive)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'a package with known type problems exits non-zero and reports them',
      Gherkin.Do.pipe(
        Given('the attw binary is installed in the container')('binOk', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.sh('test -x node_modules/.bin/attw && echo ok')
          })),
        When('untyped-resolution is analyzed')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run([fixture('untyped-resolution')], { cwd: fixtureDir('untyped-resolution') })
          })),
        Then('the analysis reports resolution problems')((s) => {
          expect(s.binOk.stdout.trim()).toBe('ok')
          expect(s.result.exitCode).not.toBe(0)
          expect(s.result.stdout).toMatch(
            /NoResolution|UntypedResolution|FalseExportDefault|NamedExports|Resolution failed|No types/,
          )
        }),
      ),
    )

    scenario(
      'a package with false CommonJS declarations exits non-zero and names the problem',
      Gherkin.Do.pipe(
        When('false-cjs is analyzed')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run([fixture('false-cjs')], { cwd: fixtureDir('false-cjs') })
          })),
        Then('the analysis reports false CommonJS problems')((s) => {
          expect(s.result.exitCode).not.toBe(0)
          expect(s.result.stdout).toMatch(/FalseCJS/)
        }),
      ),
    )

    scenarioOutline(
      '<format> output renders without throwing',
      [
        { format: 'table' },
        { format: 'table-flipped' },
        { format: 'ascii' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When(() => `false-cjs is analyzed in ${row.format} format`)('result', () =>
            Effect.gen(function*() {
              const container = yield* Container
              return yield* container.run([fixture('false-cjs'), '-f', row.format], {
                cwd: fixtureDir('false-cjs'),
              })
            })),
          Then('the analysis produces output')((s) => {
            expect(s.result.exitCode).toBeGreaterThanOrEqual(0)
            expect(s.result.stdout.length).toBeGreaterThan(0)
          }),
        ),
    )

    scenario(
      'json output parses into an analysis with a problems section',
      Gherkin.Do.pipe(
        When('untyped-resolution is analyzed as json')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run([fixture('untyped-resolution'), '-f', 'json'], {
              cwd: fixtureDir('untyped-resolution'),
            })
          })),
        Then('the output has analysis and problems keys')((s) => {
          expect(s.result.exitCode).not.toBe(0)
          const parsed = JSON.parse(s.result.stdout) as {
            analysis: { packageName?: string }
            problems?: unknown
          }
          expect(parsed.analysis.packageName).toBe('untyped-resolution')
          expect(parsed.problems).toBeDefined()
        }),
      ),
    )

    scenario(
      'entrypoints can be restricted to a subset',
      Gherkin.Do.pipe(
        When('multi-entrypoint is analyzed fully and restricted to the root entrypoint')(
          'results',
          () =>
            Effect.gen(function*() {
              const container = yield* Container
              const full = yield* container.run([fixture('multi-entrypoint'), '-f', 'json'], {
                cwd: fixtureDir('multi-entrypoint'),
              })
              const restricted = yield* container.run(
                [fixture('multi-entrypoint'), '--entrypoints', '.', '-f', 'json'],
                {
                  cwd: fixtureDir('multi-entrypoint'),
                },
              )
              return { full, restricted }
            }),
        ),
        Then('the restricted analysis has fewer entrypoints')((s) => {
          const fullKeys = Object.keys(
            (JSON.parse(s.results.full.stdout) as { analysis: { entrypoints: Record<string, unknown> } }).analysis
              .entrypoints,
          )
          const restrictedKeys = Object.keys(
            (JSON.parse(s.results.restricted.stdout) as { analysis: { entrypoints: Record<string, unknown> } })
              .analysis.entrypoints,
          )
          expect(restrictedKeys.length).toBeLessThan(fullKeys.length)
        }),
      ),
    )

    scenario(
      'excluded entrypoints are removed from the analyzed set',
      Gherkin.Do.pipe(
        When('multi-entrypoint is analyzed excluding the macros entrypoint')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run(
              [fixture('multi-entrypoint'), '--exclude-entrypoints', 'macros', '-f', 'json'],
              {
                cwd: fixtureDir('multi-entrypoint'),
              },
            )
          })),
        Then('the macros entrypoint is absent from the analysis')((s) => {
          const parsed = JSON.parse(s.result.stdout) as { analysis: { entrypoints: Record<string, unknown> } }
          // KTD4 recipe exposes './macros'; the CLI normalizes 'macros' to './macros', so check both forms
          expect(parsed.analysis.entrypoints).not.toHaveProperty('macros')
          expect(parsed.analysis.entrypoints).not.toHaveProperty('./macros')
          expect(Object.keys(parsed.analysis.entrypoints).some((k) => k.includes('macros'))).toBe(false)
        }),
      ),
    )

    scenario(
      'a package can be acquired from the registry',
      Gherkin.Do.pipe(
        When('a fixture package is requested from the registry')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run([
              '--from-npm',
              'attw-fixture-pkg@1.0.0',
              '--registry',
              'http://localhost:4873',
              '-f',
              'json',
            ])
          })),
        Then('the analysis names the fixture package')((s) => {
          expect([0, 1]).toContain(s.result.exitCode)
          const parsed = JSON.parse(s.result.stdout) as { analysis: { packageName: string } }
          expect(parsed.analysis.packageName).toBe('attw-fixture-pkg')
        }),
      ),
    )

    scenario(
      'a directory can be packed and analyzed',
      Gherkin.Do.pipe(
        Given('a minimal package directory')('setup', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.sh(
              'mkdir -p /tmp/attw-pack-test && cd /tmp/attw-pack-test && ' +
                'printf \'{"name":"attw-pack-test","version":"1.0.0","type":"module","main":"index.js"}\' > package.json && ' +
                'echo "export const v = 1" > index.js',
            )
          })),
        When('the directory is packed and analyzed')('result', () =>
          Effect.gen(function*() {
            const container = yield* Container
            return yield* container.run(['--pack', '.', '-f', 'json'], { cwd: '/tmp/attw-pack-test' })
          })),
        Then('the analysis names the packed package')((s) => {
          expect(s.setup.exitCode).toBe(0)
          expect([0, 1]).toContain(s.result.exitCode)
          const parsed = JSON.parse(s.result.stdout) as { analysis: { packageName: string } }
          expect(parsed.analysis.packageName).toBe('attw-pack-test')
        }),
      ),
    )

    scenario(
      'a .attw.json in the working directory waives the problem it names',
      Gherkin.Do.pipe(
        Given('false-cjs analyzed with no config file present')('before', () =>
          Effect.gen(function*() {
            const container = yield* Container
            yield* container.sh(`rm -f ${fixtureDir('false-cjs')}/.attw.json`)
            return yield* container.run([fixture('false-cjs')], { cwd: fixtureDir('false-cjs') })
          })),
        When('a .attw.json waiving that rule is written beside it')('after', () =>
          Effect.gen(function*() {
            const container = yield* Container
            yield* container.sh(
              `printf '%s' '{"ignoreRules":["false-cjs"]}' > ${fixtureDir('false-cjs')}/.attw.json`,
            )
            return yield* container.run([fixture('false-cjs')], { cwd: fixtureDir('false-cjs') })
          })),
        Then('the waiver is applied, so the same package now passes')((s) => {
          // Red before, green after, on one package: the file is the only change.
          // A run that ignores the file passes this scenario's first half and
          // fails its second, which is exactly how the regression presented.
          expect(s.before.exitCode).not.toBe(0)
          expect(s.before.stdout).toMatch(/FalseCJS/)
          expect(s.after.exitCode).toBe(0)
        }),
      ),
    )
  })
