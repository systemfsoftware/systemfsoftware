#!/usr/bin/env node
// Validates that every package the release pipeline will publish carries
// provenance-valid repository metadata, BEFORE the version bump is committed
// and tagged. npm cross-checks package.json#repository.url against the
// sigstore provenance attestation when OIDC trusted publishing is enabled; a
// missing or empty repository.url is compared as "" and rejected with a 422.
//
// npm does NOT compare repository.url literally. Its verifier normalizes both
// sides: the 422 text reads `expected to match
// "https://github.com/systemfsoftware/systemfsoftware"` -- no git+ prefix, no
// .git suffix -- and packages in this very repo publish cleanly under OIDC
// provenance while carrying the bare `https://...git` form in their manifest.
// This gate therefore normalizes the manifest value the same way and compares
// against that target; the owner/repo path keeps its case, because npm's match
// is case-sensitive there (a capitalization mismatch is exactly what 422s in
// the wild).
//
// The discovery set is the load-bearing invariant: this script validates
// EXACTLY the packages scripts/release.mjs publishes, no more and no less. It
// therefore reuses release.mjs's own pnpm discovery -- same invocation, same
// private filter -- instead of walking directories. The old one-level
// readdirSync over package roots never descended into container directories
// like packages/stryker-js/, so it silently skipped the two packages that then
// 422'd on a green run.
//
// Exactly two hard rules, mirroring the provenance cross-check:
//   repository.url       (normalized) === https://github.com/systemfsoftware/systemfsoftware
//   repository.directory === the package's real path relative to the repo root
// bugs/homepage are deliberately NOT gated: 7 publishable packages currently
// lack them and they are not part of the 422.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const CANONICAL_REPOSITORY_URL = 'git+https://github.com/systemfsoftware/systemfsoftware.git'

// The form npm's verifier actually compares against: git+ prefix, .git suffix,
// trailing slashes, and host case normalized away (owner/repo case preserved).
// Returns null for anything that is not a parseable non-empty string.
const normalizeRepositoryUrl = (url) => {
  if (typeof url !== 'string' || url.trim() === '') return null
  let parsed
  try {
    parsed = new URL(url.replace(/^git\+/, ''))
  } catch {
    return null
  }
  const path = parsed.pathname.replace(/\/+$/, '').replace(/\.git$/, '')
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}`
}

// Derived from the canonical URL so the expected target can never drift from
// the form the fix instructions tell people to write.
const EXPECTED_REPOSITORY_URL = normalizeRepositoryUrl(CANONICAL_REPOSITORY_URL)

// ── discovery ────────────────────────────────────────────────────────────────
// The same private-filtering rule as discoverPackagesFromPnpm() in
// scripts/release.mjs. Kept as a named pure function so the selftest can pin
// it: a private package must never reach the validator, exactly as it never
// reaches the releaser.
const filterPublishable = (packages) => packages.filter((pkg) => !pkg.private)

// Mirrors discoverPackagesFromPnpm() in scripts/release.mjs: same pnpm
// invocation, same cwd/encoding/maxBuffer, same private filter, so the package
// set is identical to the one the release script iterates. The scoped name is
// kept here (release.mjs strips it for tag scoping) so failures name the real
// npm package.
const discoverPackages = () => {
  const output = execSync('pnpm ls -r --json --depth=-1', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return filterPublishable(JSON.parse(output)).map((pkg) => ({
    name: pkg.name,
    // npm compares repository.directory against the path relative to the repo
    // root with forward slashes, so normalize separators.
    dir: relative(repoRoot, pkg.path).split(sep).join('/'),
  }))
}

// ── validation ───────────────────────────────────────────────────────────────
// Pure per-package check: (name, parsed manifest, actual relative dir) ->
// violations. No I/O, so the selftest drives it directly over in-memory
// fixtures.
const show = (value) => value === undefined ? '(missing)' : value === null ? '(unparseable)' : JSON.stringify(value)

const checkPackage = (name, pkg, relDir) => {
  const violations = []
  const repository = pkg.repository
  const url = repository?.url
  const normalized = normalizeRepositoryUrl(url)
  if (normalized !== EXPECTED_REPOSITORY_URL) {
    // The normalized form is shown only when the raw value was a string, so a
    // missing field reads as missing rather than unparseable.
    const detail = typeof url === 'string' ? ` (normalized to ${show(normalized)})` : ''
    violations.push(
      `${name}: repository.url is ${show(url)}${detail}; expected ${JSON.stringify(EXPECTED_REPOSITORY_URL)}`,
    )
  }
  const directory = repository?.directory
  if (typeof directory !== 'string' || directory !== relDir) {
    violations.push(`${name}: repository.directory is ${show(directory)}; expected ${JSON.stringify(relDir)}`)
  }
  return violations
}

const validate = () => {
  const packages = discoverPackages()
  const violations = []
  for (const { name, dir } of packages) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'))
    } catch {
      violations.push(`${name}: could not read package.json at ${dir}`)
      continue
    }
    violations.push(...checkPackage(name, manifest, dir))
  }
  if (violations.length > 0) {
    console.error('validate-publish-config: publishable package(s) with invalid provenance repository metadata\n')
    for (const violation of violations) console.error(`  ${violation}`)
    console.error(
      '\nThese will fail `pnpm publish` with 422 under OIDC provenance publishing: npm cross-checks',
    )
    console.error(
      'package.json#repository.url against the sigstore provenance attestation, so a missing or empty',
    )
    console.error(
      'repository.url is compared as "" and rejected -- after the version bump is already committed and',
    )
    console.error(
      'tagged. Add "repository": { "type": "git", "url": "git+https://github.com/systemfsoftware/systemfsoftware.git",',
    )
    console.error('"directory": "packages/<name>" } to each.')
    process.exit(1)
  }
  console.log(
    `validate-publish-config: ${packages.length} publishable package(s) clean — repository.url and repository.directory valid for OIDC provenance`,
  )
}

// ── selftest ─────────────────────────────────────────────────────────────────
// Runs on `--selftest`, before every bare scan (check:publish-config chains
// both). Drives checkPackage and filterPublishable directly over in-memory
// fixtures -- no temp files, and no dependence on the real repo contents, so
// the check stays green while manifests are being repaired. The accepted side
// pins all three URL spellings npm normalizes identically; the rejected side
// pins the failure modes npm actually 422s on.
const PACKAGE_NAME = '@systemfsoftware/stryker-js-mutation-run'
const REL_DIR = 'packages/stryker-js/mutation-run'
const OTHER_REPO = 'git+https://github.com/someone-else/other.git'
const OTHER_REPO_NORMALIZED = 'https://github.com/someone-else/other'

// Each fixture: { label, manifest, dir, expected }, where expected is the list
// of violation substrings the check MUST produce ([] = must pass with no
// violations at all). Asserted bidirectionally: every expected substring must
// appear, and every actual violation must match an expected substring, so a
// check that stops failing OR starts inventing violations goes red.
const FIXTURES = [
  {
    label: 'canonical git+ form is accepted',
    manifest: {
      name: PACKAGE_NAME,
      repository: { type: 'git', url: CANONICAL_REPOSITORY_URL, directory: REL_DIR },
    },
    dir: REL_DIR,
    expected: [],
  },
  {
    label: 'published https form (no git+ prefix) is accepted',
    manifest: {
      name: PACKAGE_NAME,
      repository: { type: 'git', url: 'https://github.com/systemfsoftware/systemfsoftware.git', directory: REL_DIR },
    },
    dir: REL_DIR,
    expected: [],
  },
  {
    label: 'bare https form (no .git suffix) is accepted',
    manifest: {
      name: PACKAGE_NAME,
      repository: { type: 'git', url: 'https://github.com/systemfsoftware/systemfsoftware', directory: REL_DIR },
    },
    dir: REL_DIR,
    expected: [],
  },
  {
    label: 'empty repository.url',
    manifest: { name: PACKAGE_NAME, repository: { url: '', directory: REL_DIR } },
    dir: REL_DIR,
    expected: ['repository.url is ""', 'normalized to (unparseable)'],
  },
  {
    label: 'missing repository entirely',
    manifest: { name: PACKAGE_NAME },
    dir: REL_DIR,
    expected: ['repository.url is (missing)', 'repository.directory is (missing)'],
  },
  {
    label: 'repository.url points at another repo',
    manifest: { name: PACKAGE_NAME, repository: { url: OTHER_REPO, directory: REL_DIR } },
    dir: REL_DIR,
    expected: [
      `repository.url is ${JSON.stringify(OTHER_REPO)}`,
      `normalized to ${JSON.stringify(OTHER_REPO_NORMALIZED)}`,
    ],
  },
  {
    label: 'missing repository.directory',
    manifest: { name: PACKAGE_NAME, repository: { url: CANONICAL_REPOSITORY_URL } },
    dir: REL_DIR,
    expected: ['repository.directory is (missing)'],
  },
  {
    label: 'repository.directory points at the wrong path',
    manifest: {
      name: PACKAGE_NAME,
      repository: { url: CANONICAL_REPOSITORY_URL, directory: 'packages/stryker-js/typescript-checker' },
    },
    dir: REL_DIR,
    expected: ['repository.directory is "packages/stryker-js/typescript-checker"'],
  },
]

const selftest = () => {
  const failures = []
  for (const fixture of FIXTURES) {
    const actual = checkPackage(PACKAGE_NAME, fixture.manifest, fixture.dir)
    for (const expected of fixture.expected) {
      if (!actual.some((violation) => violation.includes(expected))) {
        failures.push(
          `  ${fixture.label}:\n    expected a violation containing ${JSON.stringify(expected)},\n    got ${
            JSON.stringify(actual)
          }`,
        )
      }
    }
    for (const violation of actual) {
      if (!fixture.expected.some((expected) => violation.includes(expected))) {
        failures.push(`  ${fixture.label}:\n    unexpected violation ${JSON.stringify(violation)}`)
      }
    }
  }

  // The private filter is the discovery half of the set-identity invariant: a
  // private package is never publishable, so it must never reach checkPackage.
  // Assert the filter, not the checker.
  const filtered = filterPublishable([
    { name: 'root', private: true },
    { name: PACKAGE_NAME },
    { name: 'tooling', private: true },
  ])
  if (filtered.length !== 1 || filtered[0].name !== PACKAGE_NAME) {
    failures.push(
      `  private filter:\n    expected only the non-private package to survive, got ${
        JSON.stringify(filtered.map((pkg) => pkg.name))
      }`,
    )
  }

  if (failures.length > 0) {
    console.error('validate-publish-config: SELFTEST FAILED\n')
    console.error(failures.join('\n'))
    console.error('\nThe validation logic no longer matches the provenance contract it claims to enforce.')
    process.exit(1)
  }
  console.log(
    `validate-publish-config: selftest ok (${FIXTURES.length} fixtures + private-filter assertion)`,
  )
}

// Entry point. Runs only when executed directly (node scripts/...), not when
// imported -- the gate wiring (--selftest then bare scan) runs the script
// directly, and tests import the pure functions below.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) selftest()
  else validate()
}

export { checkPackage, discoverPackages, filterPublishable, normalizeRepositoryUrl }
