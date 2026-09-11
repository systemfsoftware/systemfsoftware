import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { makeSvelteParser, strykerPlugins, svelteParser } from '@systemfsoftware/stryker-js-svelte-parser'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const COMPONENT = `<script context="module">
  export const shared = 1
</script>

<script lang="ts">
  let count: number = 0
</script>

<p>{count > 0}</p>
`

/**
 * Hand-counted against COMPONENT and cross-checked against the compiler's own
 * legacy AST. Each script body starts on the newline after its opening tag, the
 * module body is 27 characters and the instance body 25, and the template
 * expression is `count > 0` after `<p>{`.
 */
const MODULE_SCRIPT = {
  range: { start: 25, end: 52 },
  format: 'js',
  isExpression: false,
  content: '\n  export const shared = 1\n',
  offset: { line: 0, column: 25 },
}

const INSTANCE_SCRIPT = {
  range: { start: 81, end: 106 },
  format: 'ts',
  isExpression: false,
  content: '\n  let count: number = 0\n',
  offset: { line: 4, column: 18 },
}

const TEMPLATE_EXPRESSION = {
  range: { start: 121, end: 130 },
  format: 'js',
  isExpression: true,
  content: 'count > 0',
  offset: { line: 8, column: 4 },
}

/** Writes a project whose svelte install answers exactly as the given modules say. */
const projectWithSvelte = (version: string, compilerSource: string, walkerSource?: string): string => {
  const fs = process.getBuiltinModule('node:fs')
  const os = process.getBuiltinModule('node:os')
  const path = process.getBuiltinModule('node:path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-svelte-project-'))
  const svelteDir = path.join(root, 'node_modules', 'svelte')
  fs.mkdirSync(svelteDir, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"svelte-project","private":true}\n')
  fs.writeFileSync(
    path.join(svelteDir, 'package.json'),
    `{"name":"svelte","version":"${version}","main":"./compiler.js"}\n`,
  )
  fs.writeFileSync(path.join(svelteDir, 'compiler.js'), compilerSource)
  if (walkerSource !== undefined) {
    const walkerDir = path.join(root, 'node_modules', 'estree-walker')
    fs.mkdirSync(walkerDir, { recursive: true })
    fs.writeFileSync(
      path.join(walkerDir, 'package.json'),
      '{"name":"estree-walker","version":"3.0.3","main":"./index.js"}\n',
    )
    fs.writeFileSync(path.join(walkerDir, 'index.js'), walkerSource)
  }
  return root
}

/**
 * A svelte install declares its version twice — in its package manifest and on
 * the compiler as `VERSION` — and the parser reads the compiler's declaration to
 * choose the module that walks the template: svelte 5 moved that walk out of
 * `svelte/compiler` into `estree-walker`, while 4 and below still walk with the
 * compiler's own `walk`. Each fixture states one version in both places, so both
 * the module that loads and the module a walker failure names are derivable from
 * the version the project declares.
 */
const SVELTE_5_VERSION = '5.55.1'
const SVELTE_4_VERSION = '4.2.0'

const compilerStub = (version: string): string =>
  `module.exports = { VERSION: "${version}", parse: () => ({ html: {} }) }\n`

/** A project whose svelte install is older than the parser supports. */
const legacyProjectDir = (): string => projectWithSvelte('3.20.0', compilerStub('3.20.0'))

/** A svelte 5 project whose walker — `estree-walker` — ships no `walk` export. */
const walkerlessProjectDir = (): string =>
  projectWithSvelte(SVELTE_5_VERSION, compilerStub(SVELTE_5_VERSION), 'module.exports = { childKeys: {} }\n')

/**
 * A svelte 4 project whose compiler ships no `walk` export. No `estree-walker`
 * install exists in it, so the compiler is the only module left to name.
 */
const compilerWithoutWalkProjectDir = (): string => projectWithSvelte(SVELTE_4_VERSION, compilerStub(SVELTE_4_VERSION))

/**
 * A project whose svelte install exposes no compiler. The install is written
 * into the project's own `node_modules`, because resolution falls back to
 * `NODE_PATH` — vitest points it at pnpm's hoisted store, where a real svelte
 * lives — so a project with no svelte of its own would still resolve one. The
 * `exports` map is what refuses `svelte/compiler` instead of exposing it.
 */
const compilerlessProjectDir = (): string => {
  const fs = process.getBuiltinModule('node:fs')
  const os = process.getBuiltinModule('node:os')
  const path = process.getBuiltinModule('node:path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-svelte-compilerless-'))
  const svelteDir = path.join(root, 'node_modules', 'svelte')
  fs.mkdirSync(svelteDir, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"compilerless-project","private":true}\n')
  fs.writeFileSync(path.join(svelteDir, 'package.json'), '{"name":"svelte","exports":{}}\n')
  return root
}

Feature("Svelte components are instrumented with the project's own compiler").body(({ scenario }) => {
  scenario(
    'A component is split into its script bodies and its template expression',
    Gherkin.Do.pipe(
      Given('a component with a module script, a typed instance script and a template expression')(
        'source',
        () => Effect.succeed(COMPONENT),
      ),
      When('the parser parses the component')(
        'actual',
        ({ source }: { source: string }) => Effect.sync(() => makeSvelteParser().parse(source, 'component.svelte')),
      ),
      Then('the module script is reported at its place in the document')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            originFileName: 'component.svelte',
            rawContent: COMPONENT,
            format: 'svelte',
            root: { moduleScript: MODULE_SCRIPT },
          })
        })
      ),
      And('the instance script and the template expression follow in document order')(
        ({ actual }: { actual: unknown }) =>
          Effect.sync(() => {
            expect(actual).toMatchObject({ root: { additionalScripts: [INSTANCE_SCRIPT, TEMPLATE_EXPRESSION] } })
          }),
      ),
      And('only the template expression is reported as an expression')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            root: {
              moduleScript: { isExpression: false },
              additionalScripts: [{ isExpression: false }, { isExpression: true }],
            },
          })
        })
      ),
    ),
  )

  scenario(
    'A project whose svelte install is too old reports the version it found',
    Gherkin.Do.pipe(
      Given('a project whose svelte install reports version 3.20.0')('projectDir', () => Effect.sync(legacyProjectDir)),
      When('the parser parses a component from that project')(
        'actual',
        ({ projectDir }: { projectDir: string }) =>
          Effect.sync(() => makeSvelteParser({ projectDir }).parse(COMPONENT, 'component.svelte')),
      ),
      Then('the parse fails with the version it found and the minimum it needs')(
        ({ actual }: { actual: unknown }) =>
          Effect.sync(() => {
            expect(actual).toMatchObject({
              _tag: 'SvelteVersionNotSupported',
              fileName: 'component.svelte',
              version: '3.20.0',
              cause: 'Expected >=3.30',
            })
          }),
      ),
      And('the failure message names the component and the version')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            message: 'Svelte version 3.20.0 is not supported for component.svelte (expected >=3.30)',
          })
        })
      ),
    ),
  )

  scenario(
    'A project whose svelte install exposes no compiler reports the compiler it could not load',
    Gherkin.Do.pipe(
      Given('a project whose svelte install exposes no compiler')(
        'projectDir',
        () => Effect.sync(compilerlessProjectDir),
      ),
      When('the parser parses a component from that project')(
        'actual',
        ({ projectDir }: { projectDir: string }) =>
          Effect.sync(() => makeSvelteParser({ projectDir }).parse(COMPONENT, 'component.svelte')),
      ),
      Then('the parse fails naming the compiler it could not load')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            _tag: 'SvelteCompilerNotFound',
            fileName: 'component.svelte',
            specifier: 'svelte/compiler',
          })
        })
      ),
      And('the failure message names the component and the compiler')((
        { actual, projectDir }: { actual: unknown; projectDir: string },
      ) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            message:
              `Svelte compiler not found for component.svelte: cannot resolve "svelte/compiler" from ${projectDir}`,
          })
        })
      ),
    ),
  )

  scenario(
    'A svelte 5 project whose template walker is missing reports the walker it could not load',
    Gherkin.Do.pipe(
      Given(`a svelte ${SVELTE_5_VERSION} project whose template walker is missing`)(
        'projectDir',
        () => Effect.sync(walkerlessProjectDir),
      ),
      When('the parser parses a component from that project')(
        'actual',
        ({ projectDir }: { projectDir: string }) =>
          Effect.sync(() => makeSvelteParser({ projectDir }).parse(COMPONENT, 'component.svelte')),
      ),
      Then('the parse fails naming the walker it could not load')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          // Svelte 5 walks with estree-walker, so that is the module a walker
          // failure must name here; the compiler is the walker only below 5.
          expect(actual).toMatchObject({
            _tag: 'SvelteWalkerNotFound',
            fileName: 'component.svelte',
            specifier: 'estree-walker',
            cause: 'estree-walker module without walk export',
          })
        })
      ),
    ),
  )

  scenario(
    'A svelte 4 project whose compiler cannot walk the template reports the compiler it could not load',
    Gherkin.Do.pipe(
      Given(`a svelte ${SVELTE_4_VERSION} project whose compiler cannot walk the template`)(
        'projectDir',
        () => Effect.sync(compilerWithoutWalkProjectDir),
      ),
      When('the parser parses a component from that project')(
        'actual',
        ({ projectDir }: { projectDir: string }) =>
          Effect.sync(() => makeSvelteParser({ projectDir }).parse(COMPONENT, 'component.svelte')),
      ),
      Then('the parse fails naming the compiler it could not load')(({ actual }: { actual: unknown }) =>
        Effect.sync(() => {
          expect(actual).toMatchObject({
            _tag: 'SvelteWalkerNotFound',
            fileName: 'component.svelte',
            specifier: 'svelte/compiler',
            cause: 'svelte/compiler module without walk export',
          })
        })
      ),
    ),
  )

  scenario(
    'The package offers one parser for svelte files',
    Gherkin.Do.pipe(
      Given('the plugin module a mutation run loads')(
        'pluginModule',
        () => Effect.succeed({ strykerPlugins, svelteParser }),
      ),
      Then('the module offers exactly that one contribution, named for the format')(
        ({ pluginModule }: { pluginModule: { strykerPlugins: readonly unknown[]; svelteParser: unknown } }) =>
          Effect.sync(() => {
            expect(pluginModule.strykerPlugins).toStrictEqual([pluginModule.svelteParser])
            expect(pluginModule.svelteParser).toMatchObject({ kind: 'Parser', name: 'svelte' })
          }),
      ),
      And('the parser it builds claims svelte files and answers without a promise')(() =>
        Effect.sync(() => {
          const parser = makeSvelteParser()
          expect(parser.extensions).toStrictEqual(['.svelte'])
          expect(parser.parse(COMPONENT, 'component.svelte')).not.toBeInstanceOf(Promise)
        })
      ),
    ),
  )
})
