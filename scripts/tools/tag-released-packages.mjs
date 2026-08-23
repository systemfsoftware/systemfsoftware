#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read --allow-write
// deno-lint-ignore-file require-await
// tag-released-packages.mjs — idempotently tag name@v<version> for every
// non-private workspace package whose tag is absent from the remote, then push.
// Supports --dry-run (no push), --json/--output for capturing the this-cycle set
// (KTD1), and --captured to reuse a prior capture file. Unchanged packages already
// have their tag and are skipped.
//
// --exclude <file> drops the packages named in that file, one per line. OIDC
// cannot debut a package npm has never seen, so the publish step skips it; if
// this script tagged it anyway, create-github-releases.mjs would publish a
// GitHub Release for a version no consumer can install. The release job still
// fails naming the package, so the omission is never silent.

const dec = new TextDecoder()

const run = async (cmd, args) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  }
  return dec.decode(out.stdout)
}

const args = Deno.args
const dryRun = args.includes('--dry-run')
const jsonFlag = args.includes('--json')
const selftestFlag = args.includes('--selftest')
let outputFile = null
let capturedFile = null
let excludeFile = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output') outputFile = args[i + 1]
  if (args[i].startsWith('--output=')) outputFile = args[i].slice('--output='.length)
  if (args[i] === '--captured' || args[i] === '--captured-file') capturedFile = args[i + 1]
  if (args[i].startsWith('--captured=')) capturedFile = args[i].slice('--captured='.length)
  if (args[i].startsWith('--captured-file=')) capturedFile = args[i].slice('--captured-file='.length)
  if (args[i] === '--exclude') excludeFile = args[i + 1]
  if (args[i].startsWith('--exclude=')) excludeFile = args[i].slice('--exclude='.length)
}

const changelogPath = (name, version) => `.changeset/changelogs/${name.replace('/', '!')}@${version}.md`

const computeThisCycle = (pkgs, remoteTags) => {
  const out = []
  for (const p of pkgs) {
    if (!p.name || p.private || !p.version) continue
    const tag = `${p.name}@v${p.version}`
    if (remoteTags.has(tag)) continue
    out.push({ name: p.name, version: p.version, tag, changelog: changelogPath(p.name, p.version) })
  }
  return out
}

const normalizeCaptured = (raw) => {
  if (!Array.isArray(raw)) throw new Error('captured file must be a JSON array')
  if (raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    return raw.map((tag) => {
      const atV = tag.lastIndexOf('@v')
      if (atV === -1) throw new Error(`invalid tag in captured list: ${tag}`)
      const name = tag.slice(0, atV)
      const version = tag.slice(atV + 2)
      return { name, version, tag, changelog: changelogPath(name, version) }
    })
  }
  return raw.map((e) => {
    if (!e.tag || !e.name || !e.version) {
      const tag = e.tag ?? (e.name && e.version ? `${e.name}@v${e.version}` : null)
      if (!tag) throw new Error(`invalid captured entry: ${JSON.stringify(e)}`)
      const atV = tag.lastIndexOf('@v')
      const name = e.name ?? tag.slice(0, atV)
      const version = e.version ?? tag.slice(atV + 2)
      return { name, version, tag, changelog: e.changelog ?? changelogPath(name, version) }
    }
    return { name: e.name, version: e.version, tag: e.tag, changelog: e.changelog ?? changelogPath(e.name, e.version) }
  })
}

/** Drop entries whose package name appears in the exclusion set. */
const dropExcluded = (cycle, excluded) => cycle.filter((entry) => !excluded.has(entry.name))

const readExcluded = async () => {
  if (!excludeFile) return new Set()
  const text = await Deno.readTextFile(excludeFile)
  return new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))
}

const loadThisCycle = async () => {
  const excluded = await readExcluded()
  if (capturedFile) {
    const text = await Deno.readTextFile(capturedFile)
    return dropExcluded(normalizeCaptured(JSON.parse(text)), excluded)
  }
  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1']))
  const remote = new Set(
    (await run('git', ['ls-remote', '--tags', 'origin']))
      .split('\n').filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
  )
  return dropExcluded(computeThisCycle(pkgs, remote), excluded)
}

const selftest = async () => {
  const failures = []
  const ok = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  ok(changelogPath('@scope/foo', '1.0.0') === '.changeset/changelogs/@scope!foo@1.0.0.md', 'changelog path')
  {
    const pkgs = [{ name: '@scope/a', version: '1.0.0', private: false }]
    const cycle = computeThisCycle(pkgs, new Set())
    ok(cycle.length === 1, 'cycle one absent')
  }
  {
    const pkgs = [{ name: '@scope/a', version: '1.0.0', private: false }]
    const cycle = computeThisCycle(pkgs, new Set(['@scope/a@v1.0.0']))
    ok(cycle.length === 0, 'cycle empty when present')
  }
  {
    const pkgs = [{ name: '@scope/priv', version: '1.0.0', private: true }]
    ok(computeThisCycle(pkgs, new Set()).length === 0, 'private excluded')
  }
  {
    const n = normalizeCaptured(['@scope/x@v1.2.3'])
    ok(n[0].name === '@scope/x' && n[0].version === '1.2.3', 'normalize string')
  }
  {
    const n = normalizeCaptured([{ name: '@scope/y', version: '2.0.0', tag: '@scope/y@v2.0.0' }])
    ok(n[0].changelog === '.changeset/changelogs/@scope!y@2.0.0.md', 'normalize object')
  }
  {
    const cycle = computeThisCycle(
      [{ name: '@scope/a', version: '1.0.0' }, { name: '@scope/debut', version: '0.1.0' }],
      new Set(),
    )
    ok(dropExcluded(cycle, new Set()).length === 2, 'no exclusions keeps the cycle')
    const kept = dropExcluded(cycle, new Set(['@scope/debut']))
    ok(kept.length === 1 && kept[0].name === '@scope/a', 'excluded package gets neither tag nor release')
  }
  if (failures.length > 0) {
    console.error('tag-released-packages: selftest FAILED\n')
    for (const f of failures) console.error(`  ${f}`)
    Deno.exit(1)
  }
  console.log(`tag-released-packages: selftest ok (${5} fixtures)`)
}

const main = async () => {
  if (selftestFlag) {
    await selftest()
    return 0
  }

  const cycle = await loadThisCycle()

  if (dryRun || jsonFlag || outputFile) {
    if (outputFile) {
      await Deno.writeTextFile(outputFile, JSON.stringify(cycle, null, 2))
      console.log(`wrote ${cycle.length} captured package(s) to ${outputFile}`)
      if (jsonFlag) console.log(JSON.stringify(cycle, null, 2))
      else for (const { tag } of cycle) console.log(`would tag ${tag}`)
      return 0
    }
    if (jsonFlag) {
      console.log(JSON.stringify(cycle, null, 2))
      return 0
    }
    for (const { tag } of cycle) console.log(`would tag ${tag}`)
    console.log(`dry run: ${cycle.length} tag(s)`)
    return 0
  }

  // real tag + push
  if (cycle.length === 0) {
    console.log('no new tags to push')
    return 0
  }

  // Deliberately serial: concurrent `git tag` invocations contend for the ref
  // store and packed-refs. Never convert this loop to Promise.all.
  const made = []
  for (const { tag } of cycle) {
    await run('git', ['tag', tag])
    made.push(tag)
  }

  if (made.length) {
    await run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
    console.log(`pushed ${made.length} tag(s): ${made.join(', ')}`)
  } else {
    console.log('no new tags to push')
  }
  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
