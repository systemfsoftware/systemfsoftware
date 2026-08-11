#!/usr/bin/env node
// LOCKED SURFACE — evaluation script (AGENTS.md Surface Classes).
// Never edit this file to admit a third party whose action runs code in a job;
// fix the workflow to use repo-local shell or a GitHub-owned action instead.
//
// Answers one question about .github/, and nothing else:
//
//   is every `uses:` ref in this repository's CI on the allowlist?
//     Repo-local (`./...`), GitHub-owned (`actions/*`), and the third parties
//     named in ALLOWED_THIRD_PARTY — currently exactly one, with a reason.
//
// Why this file is LOCKED: the allowlist is the rubric. An agent free to edit
// it would add an action and its own admission in one commit, and the gate
// would never fire. Admitting a third party is deliberately a two-commit act.
//
// Declared limits, stated rather than hidden:
//
//   - `uses:` is always a single-line scalar in Actions syntax, so refs are
//     extracted line-wise with one regex and no YAML dependency. A green run
//     means "no unlisted `uses:` on any uncommented line", never "no third-
//     party code reaches CI".
//   - The guard reads `uses:` only. A `run:` step that downloads and executes
//     something is outside what it can see; a green run does not vouch for it.
//   - A ref is unlisted when it is not repo-local, not GitHub-owned, and its
//     owner/repo prefix is not a key in ALLOWED_THIRD_PARTY. Keying on
//     owner/repo rather than owner means admitting denoland/setup-deno admits
//     nothing else under denoland/*.

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultRoot = join(repoRoot, '.github')

// owner/repo -> why this third party is admitted to run code inside a job.
// LOCKED with the rest of this file: an entry and the change it permits must
// never land together. The reason is prose a reviewer reads in the diff;
// presence is the whole machine claim.
const ALLOWED_THIRD_PARTY = new Map([
  [
    'denoland/setup-deno',
    'Supplies the Deno runtime that scripts/check-changeset.mjs and scripts/tag-released-packages.mjs are written in. The runner image ships no Deno and there is no GitHub-owned equivalent.',
  ],
])

const REF_RE = /^\s*(?:-\s*)?uses:\s*["']?([^"'#\s]+)/

const isAllowed = (ref) => {
  if (ref.startsWith('./')) return true
  if (/^actions\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*@/.test(ref)) return true
  const bare = ref.split('@')[0]
  return ALLOWED_THIRD_PARTY.has(bare.split('/').slice(0, 2).join('/'))
}

const violationsForLine = (line) => {
  if (line.trimStart().startsWith('#')) return 0
  const match = REF_RE.exec(line)
  if (!match) return 0
  return isAllowed(match[1]) ? 0 : 1
}

const scanRefs = async (root) => {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  const files = entries
    .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
  const contents = await Promise.all(files.map(async (f) => [f, await readFile(f, 'utf8')]))
  const refs = []
  const violations = []
  for (const [file, text] of contents) {
    const rel = relative(root, file)
    text.split('\n').forEach((line, index) => {
      if (line.trimStart().startsWith('#')) return
      const match = REF_RE.exec(line)
      if (!match) return
      const ref = match[1]
      refs.push({ file: rel, line: index + 1, ref })
      if (!isAllowed(ref)) violations.push({ file: rel, line: index + 1, ref })
    })
  }
  return { files: files.length, refs, violations }
}

const main = async (root) => {
  let scan
  try {
    scan = await scanRefs(root)
  } catch (error) {
    console.error(`guard-action-provenance: cannot scan ${root}: ${error.message}`)
    return 1
  }
  if (scan.violations.length > 0) {
    console.error(`guard-action-provenance: ${scan.violations.length} unlisted action reference(s)`)
    for (const v of scan.violations) console.error(`  ${v.file}:${v.line}: ${v.ref}`)
    console.error(
      '\nOnly repo-local `./...` refs, GitHub-owned `actions/*`, and the third parties\n' +
        "listed in ALLOWED_THIRD_PARTY may run code in this repository's CI. A third\n" +
        "party's action executes arbitrary code inside jobs holding contents:write,\n" +
        'pull-requests:write and id-token:write. Replace it with a local composite\n' +
        'action under .github/actions/, or with inline shell using the `gh` CLI, which\n' +
        'is preinstalled on every runner. Admitting one instead needs an entry here\n' +
        'naming why no first-party equivalent exists — in its own commit.',
    )
    return 1
  }
  console.log(
    `guard-action-provenance: ${scan.refs.length} uses: ref(s) across ${scan.files} file(s) — all listed`,
  )
  return 0
}

const FIXTURES = [
  ['      - uses: peter-evans/create-pull-request@v7', 1],
  ['        uses: some-org/repo/.github/workflows/x.yml@v1', 1],
  ['      - uses: docker://alpine:3.20', 1],
  ['      - uses: denoland/deno-lint-action@v1', 1],
  ['      - uses: denoland/setup-deno@v2', 0],
  ['      - uses: actions/checkout@v7', 0],
  ['      - uses: actions/cache/restore@v6', 0],
  ['      - uses: ./.github/actions/install-deps', 0],
  ['    uses: ./.github/workflows/reusable-checks.yml', 0],
  ['      # uses: peter-evans/create-pull-request@v7', 0],
  ['      - name: uses: is not a key here', 0],
]

const selftest = async () => {
  const failures = []

  for (const [line, expected] of FIXTURES) {
    const actual = violationsForLine(line)
    if (actual !== expected) {
      failures.push(`  ${JSON.stringify(line)}: expected ${expected} violation(s), got ${actual}`)
    }
  }

  for (const [ownerRepo, reason] of ALLOWED_THIRD_PARTY) {
    if ((reason ?? '').trim().length === 0) {
      failures.push(`  allowlist entry ${ownerRepo} has an empty reason`)
    }
  }

  // The real directory must be reachable, or a green run proves nothing was looked at.
  const live = await scanRefs(defaultRoot)
  if (live.files < 10) failures.push(`  reach: scanned only ${live.files} YAML file(s) under .github/`)
  if (live.refs.length < 25) {
    failures.push(`  reach: found only ${live.refs.length} uses: ref(s) under .github/`)
  }

  if (failures.length > 0) {
    console.error('guard-action-provenance: selftest FAILED\n')
    console.error(failures.join('\n'))
    return 1
  }
  console.log(`guard-action-provenance: selftest ok (${FIXTURES.length + 3} fixtures)`)
  return 0
}

process.exitCode = await (process.argv.includes('--selftest')
  ? selftest()
  : main(process.argv[2] ? resolve(process.argv[2]) : defaultRoot))
