#!/usr/bin/env node
// Fails when a publishable package's SHIPPED build imports a package its manifest
// declares nowhere.
//
// This is the gate that was missing when the package now published as
// @systemfsoftware/stryker-js-mutation-run shipped a
// `bin` whose dist/index.mjs imported @effect/cli, @effect/platform and effect at
// runtime while declaring all of them as `peerDependencies` only. Every other gate
// passed: the code compiles, the types resolve, the tests run -- because in the
// workspace those packages are always present. The failure only appears in a
// consumer's install, where a peer that nothing installs is a module that does not
// exist, and the binary dies on its first import.
//
// Specifiers come from a real parser (oxc-parser), not a regex over the bundle text.
// Emitted bundles contain import-shaped strings inside template literals and comments
// (`import { run } from '${node.source.value}'`), and a scanner that reads those as
// package names invents violations that cannot be fixed.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEARCH_ROOTS = ['packages', 'omp']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.stryker-tmp'])
const BUILTINS = new Set(builtinModules)

/** Every `package.json` under the search roots, skipping build output and dependencies. */
const findManifests = (root) => {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name === 'package.json') found.push(path)
    }
  }
  for (const name of SEARCH_ROOTS) {
    const dir = join(root, name)
    if (existsSync(dir)) walk(dir)
  }
  return found
}

/** Every emitted module in a build directory. */
const findEmitted = (dir) => {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.m?js$/.test(entry.name)) found.push(path)
    }
  }
  walk(dir)
  return found
}

/**
 * The static module requests of one emitted file: `import ... from 'x'`, bare
 * `import 'x'`, and re-exports (`export * from 'x'`), which carry a module request
 * exactly as an import does. Dynamic `import(expr)` is deliberately excluded -- the
 * plugin loader computes those specifiers at runtime, so no literal exists to check.
 */
const moduleRequests = (source, filename) => {
  const parsed = parseSync(filename, source)
  const requests = parsed.module.staticImports.map((entry) => entry.moduleRequest.value)
  for (const record of parsed.module.staticExports) {
    for (const entry of record.entries) {
      if (entry.moduleRequest) requests.push(entry.moduleRequest.value)
    }
  }
  return requests
}

/** The package a specifier resolves to: `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`. */
const packageOf = (specifier) => {
  const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  const segments = bare.split('/')
  return bare.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

/**
 * A specifier needs no declaration when it is relative, a Node builtin (the emitted
 * code imports `fs` and `path` both with and without the `node:` prefix), or the
 * package's own name.
 */
const needsDeclaration = (specifier, ownName) => {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false
  const name = packageOf(specifier)
  return !BUILTINS.has(name) && name !== ownName
}

/**
 * A declared package. `peerDependencies` counts: 26 packages here deliberately peer
 * on `effect` so a consumer supplies one instance rather than receiving a second
 * inlined copy, and flagging them would be wrong. `inlinedDependencies` counts
 * because the build bundles them into the output.
 */
const declaredNames = (manifest) =>
  new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.inlinedDependencies ?? {}),
  ])

/** Every undeclared runtime import across the workspace, plus how much was examined. */
export const scan = (root) => {
  const violations = []
  let packagesChecked = 0
  let importsChecked = 0

  for (const manifestPath of findManifests(root)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private) continue
    const distDir = join(dirname(manifestPath), 'dist')
    if (!existsSync(distDir)) continue

    packagesChecked += 1
    const declared = declaredNames(manifest)
    const reported = new Set()

    for (const file of findEmitted(distDir)) {
      for (const specifier of moduleRequests(readFileSync(file, 'utf8'), file)) {
        if (!needsDeclaration(specifier, manifest.name)) continue
        importsChecked += 1
        if (declared.has(packageOf(specifier)) || reported.has(specifier)) continue
        reported.add(specifier)
        violations.push(`${manifest.name}: imports ${specifier} but declares it nowhere`)
      }
    }
  }

  return { violations, packagesChecked, importsChecked }
}

const FIXTURES = [
  {
    label: 'undeclared runtime import is caught',
    manifest: { name: '@scope/undeclared', version: '1.0.0', dependencies: {} },
    dist: "import { Effect } from 'effect'\n",
    expect: ['imports effect but declares it nowhere'],
  },
  {
    label: 'peer-only import passes (the KTD9 convention)',
    manifest: { name: '@scope/peer', version: '1.0.0', peerDependencies: { effect: '*' } },
    dist: "import { Effect } from 'effect/Effect'\n",
    expect: [],
  },
  {
    label: 'bare Node builtin passes',
    manifest: { name: '@scope/builtin', version: '1.0.0' },
    dist: "import { readFileSync } from 'fs'\nimport { join } from 'node:path'\n",
    expect: [],
  },
  {
    label: 'import-shaped text inside a template literal is ignored',
    manifest: { name: '@scope/template', version: '1.0.0' },
    dist: "const a = `import { run } from '${node.source.value}'`\n" +
      "const b = `export * from '${configDir}'`\n",
    expect: [],
  },
  {
    label: 'undeclared re-export is caught',
    manifest: { name: '@scope/reexport', version: '1.0.0' },
    dist: "export * from '@effect/cli'\n",
    expect: ['imports @effect/cli but declares it nowhere'],
  },
  {
    label: 'self-referential import passes',
    manifest: { name: '@scope/self', version: '1.0.0' },
    dist: "import { x } from '@scope/self/sub'\n",
    expect: [],
  },
  {
    label: 'private package is not checked',
    manifest: { name: '@scope/private', version: '1.0.0', private: true },
    dist: "import { Effect } from 'effect'\n",
    expect: [],
  },
  {
    label: 'inlined dependency passes',
    manifest: { name: '@scope/inlined', version: '1.0.0', inlinedDependencies: { '@std/jsonc': '1.0.2' } },
    dist: "import { parse } from '@std/jsonc'\n",
    expect: [],
  },
]

const selftest = () => {
  const failures = []
  const dir = mkdtempSync(join(tmpdir(), 'check-runtime-deps-'))
  try {
    for (const fixture of FIXTURES) {
      const pkgDir = join(dir, 'packages', fixture.manifest.name.replace(/[@/]/g, '_'))
      mkdirSync(join(pkgDir, 'dist'), { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(fixture.manifest))
      writeFileSync(join(pkgDir, 'dist', 'index.mjs'), fixture.dist)
    }
    for (const fixture of FIXTURES) {
      const only = mkdtempSync(join(tmpdir(), 'check-runtime-deps-one-'))
      const pkgDir = join(only, 'packages', 'p')
      mkdirSync(join(pkgDir, 'dist'), { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(fixture.manifest))
      writeFileSync(join(pkgDir, 'dist', 'index.mjs'), fixture.dist)
      const { violations } = scan(only)
      rmSync(only, { recursive: true, force: true })
      if (violations.length !== fixture.expect.length) {
        failures.push(
          `  ${fixture.label}: expected ${fixture.expect.length} violation(s), got ${violations.length} -> ${
            JSON.stringify(violations)
          }`,
        )
        continue
      }
      for (const expected of fixture.expect) {
        if (!violations.some((violation) => violation.includes(expected))) {
          failures.push(
            `  ${fixture.label}: expected a violation containing ${JSON.stringify(expected)}, got ${
              JSON.stringify(violations)
            }`,
          )
        }
      }
    }

    // A layout change that hides every build must break the gate, never quietly pass it.
    const empty = mkdtempSync(join(tmpdir(), 'check-runtime-deps-empty-'))
    const { packagesChecked } = scan(empty)
    rmSync(empty, { recursive: true, force: true })
    if (packagesChecked !== 0) failures.push('  zero-discovery fixture found packages it should not have')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('check-runtime-deps: selftest FAILED\n')
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log(`check-runtime-deps: selftest ok (${FIXTURES.length + 1} fixtures)`)
}

const main = () => {
  if (process.argv.includes('--selftest')) {
    selftest()
    return
  }

  const { violations, packagesChecked, importsChecked } = scan(ROOT)

  if (packagesChecked === 0) {
    console.error('check-runtime-deps: found no publishable package with a build -- the scan reached nothing.')
    console.error('Build the workspace first, or repair the discovery roots in this script.')
    process.exit(1)
  }

  if (violations.length > 0) {
    console.error(`check-runtime-deps: ${violations.length} runtime import(s) declared nowhere\n`)
    for (const violation of violations) console.error(`  ${violation}`)
    console.error('\nEvery runtime import in a shipped dist/ must be declared: dependencies,')
    console.error('peerDependencies, optionalDependencies, or inlinedDependencies. An undeclared')
    console.error('import resolves in this workspace and fails in a consumer install.')
    process.exit(1)
  }

  console.log(
    `check-runtime-deps: ${packagesChecked} publishable package(s) with a build checked, ` +
      `${importsChecked} runtime import(s) all declared`,
  )
}

main()
