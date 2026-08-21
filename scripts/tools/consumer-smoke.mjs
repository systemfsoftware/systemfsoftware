#!/usr/bin/env node
// Proves the release from outside: packs every publishable package, installs the
// tarballs into a throwaway project that is not in this workspace, and then uses
// the stack the way an adopter would.
//
// Everything here exists because in-repo checks cannot see it. Source-condition
// exports, `workspace:`/`catalog:` protocols, `files` fields and dev configs are
// all invisible until the artifact is built and resolved from somewhere else. A
// consumer's first lint run found three separate defects that every in-repo gate
// passed: a published dev config that broke their lint, a missing type-aware
// engine, and an ignore file the checker silently discarded.
//
// Usage:
//   node scripts/tools/consumer-smoke.mjs [--keep]
//
// `--keep` leaves the temp project on disk and prints its path.

import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')

// The package whose in-repo lint sets the floor: a consumer's run must load at
// least as many rules as this repo loads for its own production code, or the
// preset is quietly thinner than what the architecture is developed against.
const RULE_COUNT_REFERENCE = '@systemfsoftware/effect-cell-types'

/**
 * Entries that are not ESM and must not be `import()`ed. Each names why, because
 * "it failed to import" and "it was never importable" are different verdicts and
 * only one of them is a defect.
 */
const NON_ESM_ENTRIES = {
  tsconfig: {
    match: (target) => target.endsWith('.json'),
    // Not `JSON.parse`: a tsconfig is JSONC, and these presets carry comments
    // explaining each policy. The only authority on whether a consumer can use
    // one is tsc resolving it through `extends`, so that is what runs.
    verify: 'resolved by tsc through `extends`',
    reason: 'a tsconfig preset is consumed by tsc, never by a module loader',
  },
  vitestHost: {
    match: (_target, spec) => spec.endsWith('/stryker-setup'),
    verify: 'present in the package',
    reason: 'a vitest setup module reads vitest internal state and only loads inside a vitest run',
  },
}

/** Rule families a consumer must actually receive, each with a violation that triggers it. */
const PLANTED = {
  'src/schema-leak.ts': {
    body: `import { Schema } from 'effect'\n\nexport const Thing = Schema.Struct({ a: Schema.String })\n`,
    expectRule: 'schema-declaration-location',
    family: 'schema declaration',
  },
  'src/leaked.test.ts': {
    body: `import { expect, it } from 'vitest'\n\nit('runs', () => {\n  expect(1).toBe(1)\n})\n`,
    expectRule: 'no-test-file-in-src',
    family: 'test placement',
  },
  'src/workflow-leak.ts': {
    body:
      `import * as Workflow from '@systemfsoftware/effect-cell-types'\n\nexport const decide = Workflow.make((command: string) => command)\n`,
    expectRule: 'make-file-location',
    family: 'workflow boundary',
  },
  'src/house-leak.ts': {
    body: `import { Effect } from 'effect'\n\nexport const now = Effect.sync(() => Date.now())\n`,
    expectRule: 'no-date-now-in-effect',
    family: 'house rules',
  },
  // The pure phases, the I/O sources and the description module are all walked
  // off the published `Cell.vocabulary` by the rule itself, so this fixture is
  // written the way that walk classifies: `decide` is pure, `effect/Clock` is
  // I/O, and a call to one inside the other is the violation.
  'src/confirm-order.executor.ts': {
    body:
      `import { Cell } from '@systemfsoftware/effect-cell-types'\nimport * as Clock from 'effect/Clock'\nimport * as Either from 'effect/Either'\n\nexport const description = Cell.decide((decoded) => Either.right(Clock.currentTimeMillis()))\n`,
    expectRule: 'no-io-in-phase-bodies',
    family: 'cell vocabulary',
  },
}

// A rule name that cannot exist. oxlint reports an unresolvable rule, which is
// what makes a clean baseline evidence: every configured rule was recognised,
// including the ones no consumer-side code can trigger.
const BOGUS_RULE = '@systemfsoftware/oxlint-plugin-cell-vocabulary/no-such-rule'

const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    ...options,
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\u001b\[[0-9;]*m/g, '') }
}

const readTarballManifest = (tarball) =>
  JSON.parse(
    execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
  )

const tarballHas = (tarball, entry) =>
  execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .includes(`package/${entry.replace(/^\.\//, '')}`)

const lintOnce = (dir) => {
  const r = run(path.join(dir, 'node_modules/.bin/oxlint'), ['.', '--format=default'], { cwd: dir })
  const found = r.out.match(/Found (\d+) warnings? and (\d+) errors?/)
  const finished = r.out.match(/Finished in [\d.]+m?s on (\d+) files? with (\d+) rules/)
  return {
    code: r.code,
    out: r.out,
    errors: found === null ? null : Number(found[2]),
    warnings: found === null ? null : Number(found[1]),
    rules: finished === null ? null : Number(finished[2]),
  }
}

const main = () => {
  const findings = []
  const note = (line) => console.log(`  ${line}`)

  // ── pack ──────────────────────────────────────────────────────────────────
  const packDir = mkdtempSync(path.join(tmpdir(), 'systemfsoftware-pack-'))
  const manifestPath = path.join(packDir, 'pack-manifest.json')
  const packed = run(
    'node',
    [path.join(repoRoot, 'scripts/tools/pack-all.mjs'), '--json-out', manifestPath, '--out', packDir],
    { cwd: repoRoot },
  )
  if (packed.code !== 0) {
    console.error('consumer-smoke: pack-all failed\n')
    console.error(packed.out)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const tarballs = manifest.packed
  note(`packed ${tarballs.length} tarball(s) into ${packDir}`)

  // consumer-smoke tests the published package tarballs.
  // @systemfsoftware/all was consolidated into @systemfsoftware/oxlint-config/all preset.

  // ── a project that is not this workspace ──────────────────────────────────
  const consumer = mkdtempSync(path.join(tmpdir(), 'systemfsoftware-consumer-'))
  mkdirSync(path.join(consumer, 'src'), { recursive: true })

  const workspaceCatalog = readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
  const catalogVersion = (name, catalog) => {
    const section = catalog === undefined
      ? workspaceCatalog.slice(workspaceCatalog.indexOf('\ncatalog:'))
      : workspaceCatalog.slice(workspaceCatalog.indexOf(`\n  ${catalog}:`))
    const match = section.match(new RegExp(`^\\s+'?${name.replace(/[/@.]/g, '\\$&')}'?:\\s*(\\S+)`, 'm'))
    return match === null ? undefined : match[1].replace(/['"]/g, '')
  }

  const devDependencies = {}
  // Every tarball is also installed directly, so each package's own published
  // entry points are resolvable: pnpm does not hoist a transitive dependency,
  // so an umbrella install alone cannot prove the libraries are importable.
  for (const p of tarballs) devDependencies[p.name] = `file:${p.tarball}`
  for (const [name, catalog] of [['react'], ['react-dom'], ['scheduler'], ['vitest'], ['vite'], ['storybook']]) {
    const resolved = catalogVersion(name, catalog)
    if (resolved !== undefined) devDependencies[name] = resolved
  }
  devDependencies.rxjs = '^7'

  writeFileSync(
    path.join(consumer, 'package.json'),
    `${
      JSON.stringify(
        { name: 'systemfsoftware-consumer-smoke', version: '0.0.0', private: true, type: 'module', devDependencies },
        null,
        2,
      )
    }\n`,
  )
  // `overrides` redirects every transitive @systemfsoftware specifier at the
  // tarballs too. Without it a dependency's own `^1.2.3` range is fetched from
  // the registry, which is exactly the version this run exists to pre-empt.
  const overrides = tarballs.map((p) => `  '${p.name}': file:${p.tarball}`).join('\n')
  writeFileSync(
    path.join(consumer, 'pnpm-workspace.yaml'),
    `packages: []\n\n# Native build scripts are irrelevant to what this run measures.\nstrictDepBuilds: false\n\noverrides:\n${overrides}\n`,
  )
  writeFileSync(
    path.join(consumer, 'oxlint.config.ts'),
    `import base from '@systemfsoftware/oxlint-config/base'\n\nexport default base\n`,
  )
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    `${
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'nodenext',
            moduleResolution: 'nodenext',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            exactOptionalPropertyTypes: true,
            types: [],
          },
          include: ['src', 'oxlint.config.ts'],
        },
        null,
        2,
      )
    }\n`,
  )
  writeFileSync(path.join(consumer, 'src/clean.ts'), 'export const answer = (input: number): number => input + 1\n')

  const install = run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: consumer })
  if (install.code !== 0) {
    console.error(`consumer-smoke: install failed in ${consumer}\n`)
    console.error(install.out.split('\n').slice(-25).join('\n'))
    process.exit(1)
  }
  note(`installed ${tarballs.length} tarball(s) into ${consumer}`)

  // ── every published entry point resolves ──────────────────────────────────
  const importable = []
  const otherKinds = []
  for (const p of tarballs) {
    const packageManifest = readTarballManifest(p.tarball)
    for (const [subpath, value] of Object.entries(packageManifest.exports ?? {})) {
      if (subpath === './package.json') continue
      const target = typeof value === 'string' ? value : (value.default ?? value.types ?? '')
      const spec = subpath === '.' ? p.name : `${p.name}/${subpath.replace(/^\.\//, '')}`
      const kind = Object.entries(NON_ESM_ENTRIES).find(([, rule]) => rule.match(String(target), spec))
      if (kind === undefined) importable.push(spec)
      else otherKinds.push({ spec, target: String(target), tarball: p.tarball, kind: kind[0], rule: kind[1] })
    }
  }

  const importScript = `
    const specs = ${JSON.stringify(importable)}
    const failures = []
    for (const spec of specs) {
      try { await import(spec) } catch (error) { failures.push([spec, String(error).split('\\n')[0].slice(0, 200)]) }
    }
    console.log(JSON.stringify(failures))
  `
  const imported = run('node', ['--input-type=module', '-e', importScript], { cwd: consumer })
  const importFailures = JSON.parse(imported.out.slice(imported.out.lastIndexOf('[')))
  for (const [spec, error] of importFailures) findings.push(`import failed: ${spec} :: ${error}`)
  note(`imported ${importable.length - importFailures.length}/${importable.length} ESM entry point(s)`)

  const probeDir = path.join(consumer, 'tsconfig-probes')
  mkdirSync(probeDir, { recursive: true })
  for (const entry of otherKinds) {
    if (entry.kind === 'tsconfig') {
      // A consumer's real use: extend the preset and let tsc resolve the chain.
      // `files: []` keeps the probe about resolution rather than about any source.
      const probe = path.join(probeDir, `${entry.spec.replace(/[@/]/g, '_')}.json`)
      writeFileSync(probe, `${JSON.stringify({ extends: entry.spec, files: [] }, null, 2)}\n`)
      const resolved = run(path.join(consumer, 'node_modules/.bin/tsc'), ['--showConfig', '-p', probe], {
        cwd: probeDir,
      })
      if (resolved.code !== 0) {
        findings.push(
          `${entry.spec}: tsc could not resolve it through \`extends\` — ${resolved.out.split('\n')[0].trim()}`,
        )
      }
      continue
    }
    if (!tarballHas(entry.tarball, entry.target)) {
      findings.push(`${entry.spec}: ${entry.target} is not in the tarball (${entry.rule.reason})`)
    }
  }
  rmSync(probeDir, { recursive: true, force: true })
  note(`verified ${otherKinds.length} non-ESM entry point(s) by kind`)

  // ── types resolve for a consumer ──────────────────────────────────────────
  const tsc = run(path.join(consumer, 'node_modules/.bin/tsc'), ['--noEmit'], { cwd: consumer })
  if (tsc.code !== 0) {
    findings.push(`tsc --noEmit failed in the consumer project`)
    for (const line of tsc.out.split('\n').filter((l) => /error TS/.test(l)).slice(0, 8)) {
      findings.push(`  ${line.trim()}`)
    }
  } else note('tsc --noEmit clean against the installed packages')

  // ── the preset actually enforces ──────────────────────────────────────────
  const baseline = lintOnce(consumer)
  if (baseline.code !== 0 || baseline.errors !== 0) {
    findings.push(`lint baseline is not clean: exit ${baseline.code}, ${baseline.errors} error(s)`)
    for (const line of baseline.out.split('\n').filter((l) => /^\s*x |Failed/.test(l)).slice(0, 6)) {
      findings.push(`  ${line.trim()}`)
    }
  }
  if (baseline.warnings !== 0) {
    findings.push(`lint baseline reports ${baseline.warnings} warning(s) — an unrecognised rule is reported this way`)
  }

  // The preset must come from the published umbrella, never from this repo's own
  // lint config. Recomputed from what the installer actually laid down, because a
  // config that leaked in as a transitive dependency would make every rule count
  // and every planted diagnostic below unattributable.
  const internalConfigs = ['@systemfsoftware/oxlint-config', '@systemfsoftware/vitest-config']
  for (const internal of internalConfigs) {
    const store = path.join(consumer, 'node_modules/.pnpm')
    const present = existsSync(path.join(consumer, 'node_modules', internal)) ||
      (existsSync(store) &&
        readdirSync(store).some((d) => d.startsWith(internal.replace(/[@/]/g, (c) => (c === '@' ? '@' : '+')))))
    if (present) findings.push(`${internal} reached the consumer, so the preset under test is not the published one`)
  }
  note(`neither internal config is installed in the consumer (${internalConfigs.length} checked)`)

  const reference = run('pnpm', ['--filter', RULE_COUNT_REFERENCE, 'lint'], { cwd: repoRoot })
  const referenceRules = reference.out.match(/Finished in [\d.]+m?s on \d+ files? with (\d+) rules/)
  if (referenceRules === null) findings.push(`could not read the in-repo rule count from ${RULE_COUNT_REFERENCE}`)
  else if (baseline.rules === null) findings.push('could not read the consumer rule count')
  else if (baseline.rules < Number(referenceRules[1])) {
    findings.push(`consumer loads ${baseline.rules} rules, this repo loads ${referenceRules[1]} for its own source`)
  } else note(`consumer loads ${baseline.rules} rules (repo loads ${referenceRules[1]} for ${RULE_COUNT_REFERENCE})`)

  const bogusConfig =
    `import base from '@systemfsoftware/oxlint-config/base'\n\nexport default {\n  ...base,\n  rules: { ...base.rules, '${BOGUS_RULE}': 'error' },\n}\n`
  const realConfig = readFileSync(path.join(consumer, 'oxlint.config.ts'), 'utf8')
  writeFileSync(path.join(consumer, 'oxlint.config.ts'), bogusConfig)
  const bogus = lintOnce(consumer)
  writeFileSync(path.join(consumer, 'oxlint.config.ts'), realConfig)
  if (!/not found in plugin|unknown rule|Rule '/.test(bogus.out)) {
    findings.push(
      'oxlint did not report an unresolvable rule, so a clean baseline cannot prove the rules are registered',
    )
  } else note('an unresolvable rule is reported, so the clean baseline proves every configured rule is registered')

  for (const [rel, spec] of Object.entries(PLANTED)) writeFileSync(path.join(consumer, rel), spec.body)
  const planted = lintOnce(consumer)
  if (planted.code === 0) findings.push('planted violations did not fail the lint run')
  // oxlint prefixes an error line with `x` and a warning with `!`, and prints its
  // own tally. Both are checked: a rule that fired at `warn` would still appear in
  // the output, so "the rule fired" is not the same claim as "the rule enforces".
  for (const [rel, spec] of Object.entries(PLANTED)) {
    const line = planted.out.split('\n').find((l) => l.includes(spec.expectRule))
    if (line === undefined) {
      findings.push(`${spec.family}: ${spec.expectRule} did not fire on ${rel}`)
      continue
    }
    if (!line.trim().startsWith('x ')) {
      findings.push(`${spec.family}: ${spec.expectRule} fired below error severity — ${line.trim().slice(0, 80)}`)
    }
  }
  if (planted.warnings !== 0) {
    findings.push(`planted run reported ${planted.warnings} warning(s); every planted violation must be an error`)
  }
  for (const rel of Object.keys(PLANTED)) unlinkSync(path.join(consumer, rel))
  const restored = lintOnce(consumer)
  if (restored.code !== 0 || restored.errors !== 0) {
    findings.push(`lint did not return to clean after removing the planted files: exit ${restored.code}`)
  } else {
    note(
      `death test passed: ${baseline.errors} error(s) -> ${planted.errors} -> ${restored.errors} across ${
        Object.keys(PLANTED).length
      } rule families`,
    )
  }

  // ── the published artifacts type-resolve ──────────────────────────────────
  // Each tarball is analysed with its own package directory as the working
  // directory, so the `.attw.json` that package records applies. Running from
  // anywhere else would either invent waivers or report the ESM-only conditions
  // this tree decided, per package, to accept.
  const attwBin = path.join(repoRoot, 'packages/arethetypeswrong/cli/dist/main.mjs')
  if (!existsSync(attwBin)) {
    findings.push('the attw binary is not built; run `pnpm --filter @systemfsoftware/arethetypeswrong-cli build`')
  } else {
    const sourceDirs = packageDirectories()
    for (const p of tarballs) {
      const dir = sourceDirs.get(p.name)
      if (dir === undefined) {
        findings.push(`${p.name}: packed but not a workspace member, so its type-resolution policy is unknown`)
        continue
      }
      const result = run('node', [attwBin, p.tarball], { cwd: dir })
      if (result.code !== 0) {
        const problems = (result.out.match(/^\w+: \d+$/gm) ?? []).join(' ')
        findings.push(`attw rejected ${p.name}: ${problems || 'see output'}`)
      }
    }
    note(`attw checked ${tarballs.length} tarball(s) under each package's own .attw.json`)
  }

  if (!process.argv.includes('--keep')) {
    rmSync(consumer, { recursive: true, force: true })
    rmSync(packDir, { recursive: true, force: true })
  }

  if (findings.length > 0) {
    console.error(`\nconsumer-smoke: ${findings.length} finding(s)\n`)
    for (const finding of findings) console.error(`  ${finding}`)
    if (process.argv.includes('--keep')) console.error(`\nconsumer project kept at ${consumer}`)
    process.exit(1)
  }

  console.log(
    `\nconsumer-smoke: ${tarballs.length} package(s) install, import, typecheck and lint from outside this workspace`,
  )
  if (process.argv.includes('--keep')) console.log(`consumer project kept at ${consumer}`)
}

/**
 * Every workspace member's absolute directory, queried once from pnpm rather
 * than by walking globs, so the answer is the same set the packer used.
 */
const packageDirectories = () => {
  const listed = JSON.parse(
    execFileSync('pnpm', ['ls', '-r', '--json', '--depth=-1'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  )
  return new Map(listed.filter((pkg) => pkg.name !== undefined).map((pkg) => [pkg.name, pkg.path]))
}

main()
