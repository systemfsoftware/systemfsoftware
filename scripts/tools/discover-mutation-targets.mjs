#!/usr/bin/env node
// Emits the mutation matrix: every workspace project that owns a
// `stryker.config.json`.
//
// The predicate is "a mutation target is a workspace project", and this script
// IS that predicate. The version it replaced approximated it by walking the
// filesystem for `stryker.config.json` and subtracting path labels
// (`-not -path "*/__tests__/*"`), which made the matrix a function of directory
// names: renaming `__tests__/fixtures/` to `tests/__fixtures__/fixtures/`
// silently enrolled five CLI fixture projects, one of which
// (`broken-config-project`) exists in order to fail. A filter keyed on a label
// under-matches the moment the label moves, and the symptom is enrollment
// rather than an error, so nothing reports it.
//
// `pnpm-lock.yaml`'s `importers` block is pnpm's own resolved answer to which
// directories are workspace projects. Reading it re-implements no glob
// semantics, needs no install (the discover job runs on a bare checkout, with
// no `node_modules`), and cannot drift from the workspace the build installs,
// because CI installs from this same lockfile.

import fs from 'node:fs'
import path from 'node:path'

const IMPORTERS_KEY = 'importers:'
const ROOT_IMPORTER = '.'
const STRYKER_CONFIG = 'stryker.config.json'

/**
 * The workspace project directories pnpm resolved, excluding the root.
 *
 * Only keys at the importers block's own indent are projects; deeper keys are
 * that project's dependency entries. The block ends at the next top-level key.
 */
export function readWorkspaceProjects(lockfileText) {
  const lines = lockfileText.split('\n')
  const start = lines.indexOf(IMPORTERS_KEY)
  if (start === -1) {
    throw new Error(
      `pnpm-lock.yaml declares no \`${IMPORTERS_KEY}\` block, so the workspace projects cannot be read. ` +
        'Regenerate the lockfile with `pnpm install`.',
    )
  }

  const projects = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.length > 0 && !/^[\s#]/.test(line)) break
    const key = /^ {2}(?!\s)(?<name>'[^']+'|"[^"]+"|[^:]+):\s*$/.exec(line)?.groups?.name
    if (key === undefined) continue
    const name = key.replace(/^['"]|['"]$/g, '')
    if (name !== ROOT_IMPORTER) projects.push(name)
  }

  if (projects.length === 0) {
    throw new Error(
      `pnpm-lock.yaml's \`${IMPORTERS_KEY}\` block named no workspace project besides the root. ` +
        'A matrix built from it would silently mutate nothing.',
    )
  }
  return projects
}

/**
 * No target may contain another target. A fixture project vendored inside a
 * real package's test tree is nested, and nesting is the shape that the label
 * filter used to catch by accident; asserting it directly keeps the failure
 * loud even if the enumeration above is one day replaced.
 */
function assertNoNestedTargets(targets) {
  const nested = targets.flatMap((inner) =>
    targets
      .filter((outer) => outer !== inner && inner.startsWith(`${outer}/`))
      .map((outer) => `${inner} is nested inside ${outer}`)
  )
  if (nested.length > 0) {
    throw new Error(
      `Mutation targets must not contain one another, but: ${nested.join('; ')}. ` +
        "A project inside another project's tree is a fixture, not a target.",
    )
  }
}

export function discoverMutationTargets(root) {
  const lockfile = path.join(root, 'pnpm-lock.yaml')
  if (!fs.existsSync(lockfile)) {
    throw new Error(`No pnpm-lock.yaml at ${root}, so the workspace projects cannot be read.`)
  }
  const targets = readWorkspaceProjects(fs.readFileSync(lockfile, 'utf8'))
    .filter((project) => fs.existsSync(path.join(root, project, STRYKER_CONFIG)))
    .sort()
  assertNoNestedTargets(targets)
  return targets
}

// -- selftest --

function selftest() {
  const cases = []
  const record = (name, run) => {
    try {
      run()
      cases.push(`ok   ${name}`)
    } catch (error) {
      cases.push(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const expect = (actual, expected, what) => {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`)
  }
  const expectThrows = (run, fragment) => {
    let message = ''
    try {
      run()
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    if (message === '') throw new Error(`expected a throw mentioning ${JSON.stringify(fragment)}, got none`)
    if (!message.includes(fragment)) {
      throw new Error(`expected a throw mentioning ${JSON.stringify(fragment)}, got ${JSON.stringify(message)}`)
    }
  }

  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'mutation-targets-'))
  const build = (name, lock, dirs) => {
    const root = path.join(scratch, name)
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), lock)
    for (const dir of dirs) {
      fs.mkdirSync(path.join(root, dir), { recursive: true })
      fs.writeFileSync(path.join(root, dir, STRYKER_CONFIG), '{}\n')
    }
    return root
  }

  const lockOf = (projects) =>
    [
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      '      vitest:',
      '        specifier: ^4',
      '',
      ...projects.flatMap((p) => [`  ${p}:`, '    dependencies:', '      effect:', '        specifier: catalog:', '']),
      'packages:',
      '',
      '  effect@4.0.0:',
      '    resolution: {integrity: sha512-x}',
    ].join('\n')

  record('a fixture project inside a package tree is not a target', () => {
    // The exact regression: the fixture owns a stryker.config.json and lives
    // under the CLI's test tree, but pnpm never resolved it as a project.
    const root = build(
      'fixture-excluded',
      lockOf(['packages/stryker-js/cli', 'packages/hex-schema']),
      [
        'packages/stryker-js/cli',
        'packages/hex-schema',
        'packages/stryker-js/cli/tests/__fixtures__/fixtures/broken-config-project',
        'packages/stryker-js/cli/tests/__fixtures__/fixtures/minimal-project',
      ],
    )
    expect(discoverMutationTargets(root), ['packages/hex-schema', 'packages/stryker-js/cli'], 'targets')
  })

  record('a workspace project without a stryker config is not a target', () => {
    const root = build('no-config', lockOf(['packages/a', 'packages/b']), ['packages/a'])
    expect(discoverMutationTargets(root), ['packages/a'], 'targets')
  })

  record('quoted and nested importer keys are read correctly', () => {
    const lock = [
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      "      '@scope/dep':",
      '        specifier: ^1',
      '',
      "  'packages/quoted':",
      '    dependencies:',
      "      '@scope/other':",
      '        specifier: ^2',
      '',
      'snapshots:',
    ].join('\n')
    const root = build('quoted', lock, ['packages/quoted'])
    expect(discoverMutationTargets(root), ['packages/quoted'], 'targets')
  })

  record('a lockfile with no importers block fails loudly', () => {
    const root = build('no-importers', "lockfileVersion: '9.0'\n\npackages:\n", [])
    expectThrows(() => discoverMutationTargets(root), 'declares no `importers:` block')
  })

  record('a lockfile naming only the root fails loudly', () => {
    const root = build('root-only', lockOf([]), [])
    expectThrows(() => discoverMutationTargets(root), 'named no workspace project besides the root')
  })

  record('a nested pair of targets fails loudly', () => {
    // Defence in depth: if the enumeration ever admits a project inside another
    // project, the invariant still fires instead of enrolling it.
    const root = build(
      'nested',
      lockOf(['packages/outer', 'packages/outer/inner']),
      ['packages/outer', 'packages/outer/inner'],
    )
    expectThrows(() => discoverMutationTargets(root), 'must not contain one another')
  })

  record('a missing lockfile fails loudly', () => {
    const root = path.join(scratch, 'absent')
    fs.mkdirSync(root, { recursive: true })
    expectThrows(() => discoverMutationTargets(root), 'No pnpm-lock.yaml at')
  })

  fs.rmSync(scratch, { recursive: true, force: true })

  for (const line of cases) console.log(line)
  const failed = cases.filter((c) => c.startsWith('FAIL'))
  console.log(
    `\ndiscover-mutation-targets: selftest ${failed.length === 0 ? 'passed' : 'FAILED'} (${cases.length} cases)`,
  )
  return failed.length === 0 ? 0 : 1
}

// -- entry --

if (process.argv.includes('--selftest')) {
  process.exitCode = selftest()
} else {
  const targets = discoverMutationTargets(process.cwd())
  const json = JSON.stringify(targets)
  if (process.argv.includes('--github')) {
    const out = process.env.GITHUB_OUTPUT
    if (out === undefined) {
      throw new Error('--github needs GITHUB_OUTPUT, which is unset outside a GitHub Actions step.')
    }
    fs.appendFileSync(out, `packages=${json}\npackage_count=${targets.length}\n`)
  }
  console.log(json)
}
