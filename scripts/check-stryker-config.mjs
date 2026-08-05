#!/usr/bin/env node
/**
 * check-stryker-config.mjs — Gate every stryker.config.json in the repo.
 *
 * Five checks, in this order:
 * 1. Fail closed on zero discovered configs — a gate that passes vacuously is
 *    not a gate. The Locked guard-mutate-scope.mjs exits 0 on an empty tree
 *    (measured 2026-08-05); reproducing that hole here would be self-defeating.
 * 2. Every config validates against `stryker-schema.json`, the artifact each
 *    config already names in `$schema`. It is produced by no part of the
 *    generator, so it is the one check that can disagree with it — byte
 *    equality alone only ever proves the generator agrees with itself.
 * 3. Every plugin subpath resolves against the target package's
 *    `package.json#exports`. This is the check that would have caught
 *    `@systemfsoftware/stryker-plugins/lint-rule-helper-ignorer` — declared by
 *    13 packages, exported by none, for its entire life.
 * 4. Every gate relaxation (`thresholds.break` under 100, or a non-empty
 *    `mutator.excludedMutations`) carries `reason`, `issue`, and an `expires`
 *    date that has not passed. CONSTITUTION §III.3 bans reaching a score both
 *    by lowering the gate and by narrowing the mutated set.
 * 5. Every config is byte-identical to what the generator produces.
 *
 * `--selftest` runs each check against in-process fixtures, including the
 * known-bad ones, so the gate re-proves itself on every invocation rather than
 * only under `pnpm test`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { discoverConfigs, generateAll, repoRoot } from './generate-stryker-configs.mjs'
import { isRelaxation, overrides } from './stryker-config.source.mjs'

const SCHEMA_PATH = 'packages/stryker-js/core/schema/stryker-schema.json'

// -- reporting ----------------------------------------------------------------

const makeReport = () => {
  const errors = []
  return {
    errors,
    error: (msg) => errors.push(msg),
    /** @returns true when clean */
    flush(label) {
      if (errors.length === 0) return true
      console.error(`${label}: ${errors.length} problem(s)`)
      for (const e of errors) console.error(`  ERROR: ${e}`)
      return false
    },
  }
}

// -- check 2: schema ----------------------------------------------------------

/**
 * ajv is a direct dependency of the fork's own core, so the gate validates with
 * the same validator the runtime uses. Resolving from that package rather than
 * the root avoids adding a dependency for a check that already has one.
 */
export const loadSchemaValidator = (root) => {
  const req = createRequire(path.join(root, 'packages/stryker-js/core/package.json'))
  const mod = req('ajv')
  const Ajv = mod.default ?? mod
  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true })
  return ajv.compile(JSON.parse(fs.readFileSync(path.join(root, SCHEMA_PATH), 'utf8')))
}

export const checkSchema = (file, config, validate, report) => {
  if (validate(config)) return
  for (const err of validate.errors ?? []) {
    report.error(`${file}: schema violation at \`${err.instancePath || '/'}\` — ${err.message}`)
  }
}

// -- check 3: plugin subpaths -------------------------------------------------

/** Split `@scope/name/sub/path` into its package name and `./sub/path`. */
export const splitSpecifier = (specifier) => {
  const parts = specifier.split('/')
  const cut = specifier.startsWith('@') ? 2 : 1
  const name = parts.slice(0, cut).join('/')
  const rest = parts.slice(cut)
  return { name, subpath: rest.length === 0 ? '.' : `./${rest.join('/')}` }
}

/**
 * Whether `exports` publishes `subpath`. Handles the three legal shapes: a bare
 * string, a conditions object with no subpath keys, and a subpath map with
 * optional `*` wildcards. A subpath mapped to null is explicitly blocked.
 */
export const exportsPublishes = (exportsField, subpath) => {
  if (exportsField === undefined || exportsField === null) return subpath === '.'
  if (typeof exportsField === 'string') return subpath === '.'
  const keys = Object.keys(exportsField)
  const isSubpathMap = keys.some((k) => k === '.' || k.startsWith('./'))
  if (!isSubpathMap) return subpath === '.'
  if (Object.hasOwn(exportsField, subpath)) return exportsField[subpath] !== null
  return keys.some((k) => {
    if (!k.includes('*')) return false
    const [prefix, suffix = ''] = k.split('*')
    return (
      subpath.length >= prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix) &&
      exportsField[k] !== null
    )
  })
}

/**
 * Locate a package's manifest by walking `node_modules` upward from the package
 * that declares the plugin — which is where Stryker itself resolves it from, and
 * the only place a workspace-local dependency is guaranteed to be visible.
 *
 * Deliberately NOT `require.resolve('<name>/package.json')`: most packages here
 * do not publish `./package.json` in `exports`, so that call throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED and every plugin reads as "not installed" — a
 * gate that fails on everything is as useless as one that passes on everything.
 * Reading the file directly sidesteps export maps, which is correct: we are
 * inspecting the manifest, not importing from the package.
 */
export const findManifest = (fromDir, name, stopAt) => {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name, 'package.json')
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'))
      } catch {
        return null
      }
    }
    if (dir === stopAt) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export const checkPluginSubpaths = (file, config, readManifest, report) => {
  for (const specifier of config.plugins ?? []) {
    const { name, subpath } = splitSpecifier(specifier)
    const manifest = readManifest(name)
    if (manifest === null) {
      report.error(`${file}: plugin \`${specifier}\` names package \`${name}\`, which is not installed`)
      continue
    }
    if (!exportsPublishes(manifest.exports, subpath)) {
      report.error(
        `${file}: plugin \`${specifier}\` requires subpath \`${subpath}\`, which \`${name}\` does not export`,
      )
    }
  }
}

// -- check 4: relaxations -----------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const checkRelaxation = (dir, config, entry, today, report) => {
  if (!isRelaxation(config)) return
  const what = config.thresholds?.break < 100
    ? `thresholds.break = ${config.thresholds.break}`
    : `mutator.excludedMutations (${config.mutator.excludedMutations.length} operator(s))`
  if (!entry) {
    report.error(`${dir}: relaxes the mutation gate (${what}) with no entry in stryker-config.source.mjs`)
    return
  }
  if (!entry.reason?.trim()) report.error(`${dir}: relaxes the mutation gate (${what}) with no \`reason\``)
  if (!entry.issue?.trim()) report.error(`${dir}: relaxes the mutation gate (${what}) with no tracking \`issue\``)
  if (!entry.expires) {
    report.error(`${dir}: relaxes the mutation gate (${what}) with no \`expires\` date`)
    return
  }
  if (!DATE_RE.test(entry.expires)) {
    report.error(`${dir}: \`expires\` must be YYYY-MM-DD, got \`${entry.expires}\``)
    return
  }
  if (entry.expires < today) {
    report.error(
      `${dir}: relaxation expired on ${entry.expires} (today is ${today}) — kill the survivors or renegotiate at ${
        entry.issue ?? 'the tracking issue'
      }`,
    )
  }
}

/** R4: a deviation without a stated reason is undocumented drift. */
export const checkReasons = (report) => {
  for (const [dir, entry] of Object.entries(overrides)) {
    if (!entry.reason?.trim()) report.error(`${dir}: overrides entry has no \`reason\``)
  }
}

// -- check 5: drift -----------------------------------------------------------

export const checkDrift = (file, actual, expected, report) => {
  if (actual === expected) return
  const a = safeParse(actual)
  const b = safeParse(expected)
  if (a === null || b === null) {
    report.error(`${file}: differs from generated output and is not parseable JSON`)
    return
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const changed = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
  if (changed.length === 0) {
    report.error(`${file}: formatting differs from generated output — run \`pnpm generate:stryker-config\``)
    return
  }
  for (const k of changed) {
    report.error(
      `${file}: key \`${k}\` is \`${JSON.stringify(a[k])}\` on disk but \`${
        JSON.stringify(b[k])
      }\` in stryker-config.source.mjs`,
    )
  }
}

const safeParse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// -- real run -----------------------------------------------------------------

export const checkAll = (root = repoRoot(), today = new Date().toISOString().slice(0, 10)) => {
  const report = makeReport()
  const files = discoverConfigs(root)

  if (files.length === 0) {
    report.error('discovered 0 stryker.config.json files — refusing to pass vacuously on an empty set')
    return { report, count: 0 }
  }

  const validate = loadSchemaValidator(root)
  const generated = generateAll(root, files)
  const manifestCache = new Map()
  const readManifestFrom = (fromDir) => (name) => {
    const key = `${fromDir}\u0000${name}`
    if (manifestCache.has(key)) return manifestCache.get(key)
    const manifest = findManifest(path.join(root, fromDir), name, root)
    manifestCache.set(key, manifest)
    return manifest
  }

  checkReasons(report)

  for (const file of files) {
    const raw = fs.readFileSync(path.join(root, file), 'utf8')
    const config = safeParse(raw)
    if (config === null) {
      report.error(`${file}: is not parseable JSON`)
      continue
    }
    const dir = path.dirname(file)
    checkSchema(file, config, validate, report)
    checkPluginSubpaths(file, config, readManifestFrom(dir), report)
    checkRelaxation(dir, config, overrides[dir], today, report)
    checkDrift(file, raw, generated.get(file), report)
  }

  return { report, count: files.length }
}

// -- selftest -----------------------------------------------------------------

const BASE = {
  $schema: './node_modules/@systemfsoftware/stryker-js-core/schema/stryker-schema.json',
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/**/*.ts'],
  thresholds: { high: 100, low: 80, break: 100 },
}

const MANIFESTS = {
  '@stryker-mutator/vitest-runner': { exports: { '.': './dist/index.js' } },
  '@systemfsoftware/stryker-plugins': {
    exports: { '.': './dist/index.js', './effect-schema-ignorer': './dist/effect-schema-ignorer.mjs' },
  },
  '@wildcard/pkg': { exports: { './*': './dist/*.js' } },
  '@blocked/pkg': { exports: { '.': './i.js', './secret': null } },
  '@conditions/pkg': { exports: { import: './i.mjs', require: './i.cjs' } },
}
const fakeManifest = (name) => MANIFESTS[name] ?? null

const selftest = () => {
  const root = repoRoot()
  const validate = loadSchemaValidator(root)
  const cases = []
  const scenario = (name, fn) => {
    const report = makeReport()
    // A scenario that throws is a failing scenario, not a crashed selftest --
    // deleting a guard under test often turns a clean failure into an exception.
    try {
      fn(report)
    } catch (err) {
      report.error(`threw: ${err?.message ?? err}`)
    }
    cases.push({ name, errors: report.errors })
  }

  // -- check 1: fail closed on zero, exercised end to end against a real empty tree
  scenario('zero configs fails, and says the gate refused to pass vacuously', (r) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-config-gate-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmp })
      const { report, count } = checkAll(tmp)
      if (count !== 0) r.error(`fixture tree was meant to hold zero configs, found ${count}`)
      if (report.errors.length === 0) {
        r.error('gate PASSED on an empty config set — this is the vacuous-pass hole R8 exists to close')
      } else if (!/vacuous/.test(report.errors[0])) r.error(`message does not name the refusal: ${report.errors[0]}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  // -- check 3: plugin subpaths
  scenario('exported subpath passes', (r) => {
    checkPluginSubpaths(
      'f',
      { plugins: ['@systemfsoftware/stryker-plugins/effect-schema-ignorer'] },
      fakeManifest,
      r,
    )
  })
  scenario('THE PHANTOM: unexported subpath fails, naming subpath and package', (r) => {
    const inner = makeReport()
    checkPluginSubpaths(
      'f',
      { plugins: ['@systemfsoftware/stryker-plugins/lint-rule-helper-ignorer'] },
      fakeManifest,
      inner,
    )
    if (inner.errors.length !== 1) r.error('expected exactly one error for the phantom subpath')
    else if (!/lint-rule-helper-ignorer/.test(inner.errors[0]) || !/stryker-plugins/.test(inner.errors[0])) {
      r.error(`error names neither subpath nor package: ${inner.errors[0]}`)
    }
  })
  scenario('root specifier passes', (r) => {
    checkPluginSubpaths('f', { plugins: ['@systemfsoftware/stryker-plugins'] }, fakeManifest, r)
  })
  scenario('uninstalled package fails', (r) => {
    const inner = makeReport()
    checkPluginSubpaths('f', { plugins: ['@nope/missing'] }, fakeManifest, inner)
    if (inner.errors.length !== 1) r.error('expected one error for an uninstalled plugin package')
  })
  scenario('wildcard export resolves', (r) => {
    checkPluginSubpaths('f', { plugins: ['@wildcard/pkg/anything'] }, fakeManifest, r)
  })
  scenario('null-mapped subpath is blocked', (r) => {
    const inner = makeReport()
    checkPluginSubpaths('f', { plugins: ['@blocked/pkg/secret'] }, fakeManifest, inner)
    if (inner.errors.length !== 1) r.error('a subpath mapped to null must be treated as unexported')
  })
  scenario('conditions-only exports publish the root', (r) => {
    checkPluginSubpaths('f', { plugins: ['@conditions/pkg'] }, fakeManifest, r)
    const inner = makeReport()
    checkPluginSubpaths('f', { plugins: ['@conditions/pkg/sub'] }, fakeManifest, inner)
    if (inner.errors.length !== 1) r.error('conditions-only exports must not publish subpaths')
  })

  // -- check 2: schema, independent of byte-equality
  scenario('schema-valid config passes', (r) => checkSchema('f', BASE, validate, r))
  scenario('schema-invalid config fails even when byte-equal to generated', (r) => {
    const bad = { ...BASE, thresholds: { high: 100, low: 80, break: 900 } }
    const text = `${JSON.stringify(bad, null, 2)}\n`
    const drift = makeReport()
    checkDrift('f', text, text, drift) // byte-identical: drift check is silent
    const schema = makeReport()
    checkSchema('f', bad, validate, schema)
    if (drift.errors.length !== 0) r.error('fixture was meant to be byte-identical')
    if (schema.errors.length === 0) r.error('schema oracle did not reject break: 900 — circular validation')
  })
  scenario('schema rejects a wrong-typed key', (r) => {
    const inner = makeReport()
    checkSchema('f', { ...BASE, mutate: 'src/**/*.ts' }, validate, inner)
    if (inner.errors.length === 0) r.error('schema accepted a string where mutate must be an array')
  })

  // -- check 5: drift
  scenario('byte-identical config passes drift', (r) => {
    const text = `${JSON.stringify(BASE, null, 2)}\n`
    checkDrift('f', text, text, r)
  })
  scenario('one mutated key fails, naming that key', (r) => {
    const expected = `${JSON.stringify(BASE, null, 2)}\n`
    const actual = `${JSON.stringify({ ...BASE, testRunner: 'jest' }, null, 2)}\n`
    const inner = makeReport()
    checkDrift('f', actual, expected, inner)
    if (inner.errors.length !== 1 || !/testRunner/.test(inner.errors[0])) {
      r.error(`expected one error naming testRunner, got: ${JSON.stringify(inner.errors)}`)
    }
  })
  scenario('formatting-only drift is reported as formatting', (r) => {
    const expected = `${JSON.stringify(BASE, null, 2)}\n`
    const actual = `${JSON.stringify(BASE)}\n`
    const inner = makeReport()
    checkDrift('f', actual, expected, inner)
    if (inner.errors.length !== 1 || !/formatting/.test(inner.errors[0])) {
      r.error(`expected a formatting-only report, got: ${JSON.stringify(inner.errors)}`)
    }
  })

  // -- check 4: relaxations
  const relaxed = { ...BASE, thresholds: { high: 100, low: 100, break: 0 } }
  const narrowed = { ...BASE, mutator: { excludedMutations: ['StringLiteral'] } }
  const TODAY = '2026-08-05'
  const expectFail = (r, label, dir, config, entry, match) => {
    const inner = makeReport()
    checkRelaxation(dir, config, entry, TODAY, inner)
    if (inner.errors.length === 0) r.error(`${label}: expected a failure, got none`)
    else if (match && !match.test(inner.errors[0])) r.error(`${label}: message was ${inner.errors[0]}`)
  }

  scenario('break: 0 with no entry fails', (r) => expectFail(r, 'no entry', 'p', relaxed, undefined, /no entry/))
  scenario(
    'break: 0 with reason but no issue fails',
    (r) => expectFail(r, 'no issue', 'p', relaxed, { reason: 'x' }, /issue/),
  )
  scenario(
    'break: 0 with reason + issue but no expires fails',
    (r) => expectFail(r, 'no expires', 'p', relaxed, { reason: 'x', issue: 'i' }, /expires/),
  )
  scenario(
    'break: 0 with a PAST expires fails',
    (r) => expectFail(r, 'expired', 'p', relaxed, { reason: 'x', issue: 'i', expires: '2020-01-01' }, /expired/),
  )
  scenario(
    'break: 0 with a malformed expires fails',
    (r) => expectFail(r, 'malformed', 'p', relaxed, { reason: 'x', issue: 'i', expires: 'soon' }, /YYYY-MM-DD/),
  )
  scenario(
    'break: 0 with a FUTURE expires passes',
    (r) => checkRelaxation('p', relaxed, { reason: 'x', issue: 'i', expires: '2099-01-01' }, TODAY, r),
  )
  scenario(
    'narrowing the mutant set is a relaxation too',
    (r) => expectFail(r, 'excludedMutations', 'p', narrowed, undefined, /excludedMutations/),
  )
  scenario(
    'an explicitly EMPTY excludedMutations is not a relaxation',
    (r) => checkRelaxation('p', { ...BASE, mutator: { excludedMutations: [] } }, undefined, TODAY, r),
  )
  scenario('break: 100 with no entry passes', (r) => checkRelaxation('p', BASE, undefined, TODAY, r))

  const failed = cases.filter((c) => c.errors.length > 0)
  if (failed.length > 0) {
    console.error(`check-stryker-config --selftest: ${failed.length}/${cases.length} scenario(s) FAILED`)
    for (const c of failed) {
      console.error(`  FAIL: ${c.name}`)
      for (const e of c.errors) console.error(`        ${e}`)
    }
    return false
  }
  console.log(`check-stryker-config --selftest: ${cases.length} scenario(s) passed`)
  return true
}

// -- entry point --------------------------------------------------------------

const main = () => {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest() ? 0 : 1)
  }
  const { report, count } = checkAll()
  if (!report.flush('check-stryker-config')) process.exit(1)
  console.log(`check-stryker-config: ${count} config(s) clean`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
