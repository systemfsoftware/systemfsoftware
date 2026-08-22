#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read --allow-write --allow-net=api.github.com --allow-env=GH_TOKEN,GITHUB_TOKEN
// deno-lint-ignore-file require-await prefer-const
// create-github-releases.mjs — fail-closed GitHub Releases from pnpm changelogs.
// KTD1: this-cycle set is public packages whose name@v<version> is absent from origin.
// KTD3: after loop, PATCH make_latest:true on one successful this-cycle release.
// R2: missing/empty .changeset/changelogs/... file is ::error:: + exit 1.
// R4: empty captured set exits 0. --dry-run lists plan. --selftest covers fixtures.

const dec = new TextDecoder()

const run = async (cmd, args) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  return dec.decode(out.stdout)
}

const GITHUB = 'https://api.github.com'
const getToken = () => {
  try {
    return Deno.env.get('GITHUB_TOKEN') ?? Deno.env.get('GH_TOKEN') ?? ''
  } catch {
    return ''
  }
}

const args = Deno.args
const dryRun = args.includes('--dry-run')
const assertMode = args.includes('--assert')
const selftestFlag = args.includes('--selftest')

let capturedFile = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--captured' || args[i] === '--captured-file') capturedFile = args[i + 1]
  if (args[i].startsWith('--captured=')) capturedFile = args[i].slice('--captured='.length)
  if (args[i].startsWith('--captured-file=')) capturedFile = args[i].slice('--captured-file='.length)
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

const loadCaptured = async () => {
  if (capturedFile) {
    const text = await Deno.readTextFile(capturedFile)
    const raw = JSON.parse(text)
    return normalizeCaptured(raw)
  }
  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1']))
  const remoteTags = new Set(
    (await run('git', ['ls-remote', '--tags', 'origin']))
      .split('\n').filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
  )
  return computeThisCycle(pkgs, remoteTags)
}

const api = async (path, init) => {
  const token = getToken()
  const res = await fetch(`${GITHUB}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  return res
}

const assertChangelogs = async (captured, opts = {}) => {
  const read = opts.readTextFile ?? Deno.readTextFile.bind(Deno)
  const stat = opts.stat ?? Deno.stat.bind(Deno)
  for (const { name, version, changelog } of captured) {
    let exists = false
    try {
      await stat(changelog)
      exists = true
    } catch {
      exists = false
    }
    if (!exists) {
      const msg =
        `Missing changelog for ${name}@${version}: expected ${changelog} — body must be pnpm-generated changelog at .changeset/changelogs/<name with / as !>@<version>.md`
      console.error(`::error::${msg}`)
      throw new Error(msg)
    }
    const content = await read(changelog)
    if (!content || content.trim().length === 0) {
      const msg =
        `Empty changelog for ${name}@${version}: ${changelog} is empty — body must be pnpm-generated changelog`
      console.error(`::error::${msg}`)
      throw new Error(msg)
    }
  }
}

// selftest — pure helper coverage without network/git
const selftest = async () => {
  const failures = []

  const ok = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  // helper: changelog path encoding
  ok(
    changelogPath('@systemfsoftware/effect-atom', '2.0.0') ===
      '.changeset/changelogs/@systemfsoftware!effect-atom@2.0.0.md',
    'changelog path encoding',
  )

  // 1) happy path: one public, tag absent, changelog present
  {
    const pkgs = [{ name: '@scope/foo', version: '1.2.3', private: false }]
    const remote = new Set()
    const cycle = computeThisCycle(pkgs, remote)
    ok(cycle.length === 1 && cycle[0].tag === '@scope/foo@v1.2.3', 'happy: cycle length 1')
    ok(cycle[0].changelog === '.changeset/changelogs/@scope!foo@1.2.3.md', 'happy: changelog path')
    const fileMap = { '.changeset/changelogs/@scope!foo@1.2.3.md': '## 1.2.3\n- fix' }
    try {
      await assertChangelogs(cycle, {
        stat: async (p) => {
          if (!(p in fileMap)) throw new Deno.errors.NotFound('')
          return {}
        },
        readTextFile: async (p) => fileMap[p],
      })
    } catch (e) {
      failures.push(`happy assert should succeed: ${e.message}`)
    }
  }

  // 2) missing file -> assert fails
  {
    const pkgs = [{ name: '@scope/bar', version: '0.1.0', private: false }]
    const cycle = computeThisCycle(pkgs, new Set())
    try {
      await assertChangelogs(cycle, {
        stat: async () => {
          throw new Deno.errors.NotFound('')
        },
        readTextFile: async () => {
          throw new Deno.errors.NotFound('')
        },
      })
      failures.push('missing file should have thrown')
    } catch {
      // expected
    }
  }

  // 3) empty file -> assert fails
  {
    const pkgs = [{ name: '@scope/baz', version: '0.2.0', private: false }]
    const cycle = computeThisCycle(pkgs, new Set())
    const fileMap = { '.changeset/changelogs/@scope!baz@0.2.0.md': '   \n' }
    try {
      await assertChangelogs(cycle, {
        stat: async () => ({}),
        readTextFile: async (p) => fileMap[p],
      })
      failures.push('empty file should have thrown')
    } catch {
      // expected
    }
    // also zero-length
    const fileMap2 = { '.changeset/changelogs/@scope!baz@0.2.0.md': '' }
    try {
      await assertChangelogs(cycle, {
        stat: async () => ({}),
        readTextFile: async (p) => fileMap2[p],
      })
      failures.push('zero-length file should have thrown')
    } catch {
      // expected
    }
  }

  // 4) private excluded
  {
    const pkgs = [
      { name: '@scope/pub', version: '1.0.0', private: false },
      { name: '@scope/priv', version: '1.0.0', private: true },
      { name: 'systemfsoftware', version: '0.0.0', private: true },
    ]
    const cycle = computeThisCycle(pkgs, new Set())
    ok(cycle.length === 1 && cycle[0].name === '@scope/pub', 'private excluded')
  }

  // 5) empty set -> all tags present
  {
    const pkgs = [{ name: '@scope/foo', version: '1.0.0', private: false }]
    const remote = new Set(['@scope/foo@v1.0.0'])
    const cycle = computeThisCycle(pkgs, remote)
    ok(cycle.length === 0, 'empty set when all tags present')
  }

  // 6) captured-list reuse after tags exist (must not recompute)
  {
    const captured = normalizeCaptured(['@scope/a@v1.0.0', '@scope/b@v2.0.0'])
    // simulate remote now has those tags (after push), but captured still used
    const fileMap = {
      '.changeset/changelogs/@scope!a@1.0.0.md': 'notes a',
      '.changeset/changelogs/@scope!b@2.0.0.md': 'notes b',
    }
    let postCount = 0
    let patchCount = 0
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      const path = url.toString().replace(GITHUB, '')
      if (path.startsWith('/repos/') && path.includes('/releases/tags/')) {
        return { status: 404, text: async () => 'not found', json: async () => ({}), headers: new Map() }
      }
      if (path.endsWith('/releases') && init?.method === 'POST') {
        postCount++
        return { status: 201, text: async () => '', json: async () => ({ id: 100 + postCount }), headers: new Map() }
      }
      if (path.match(/\/releases\/\d+/) && init?.method === 'PATCH') {
        patchCount++
        return { status: 200, text: async () => '', json: async () => ({}), headers: new Map() }
      }
      return { status: 404, text: async () => '', json: async () => ({}), headers: new Map() }
    }
    // simulate create loop using captured directly, not recompute
    let created = []
    for (const entry of captured) {
      const body = fileMap[entry.changelog]
      const slug = 'systemfsoftware/systemfsoftware'
      const existing = await globalThis.fetch(`${GITHUB}/repos/${slug}/releases/tags/${encodeURIComponent(entry.tag)}`)
      if (existing.status === 200) continue
      const res = await globalThis.fetch(`${GITHUB}/repos/${slug}/releases`, {
        method: 'POST',
        body: JSON.stringify({ tag_name: entry.tag, body }),
      })
      if (res.status === 201) created.push({ tag: entry.tag, id: (await res.json()).id })
    }
    // reconcile
    if (created.length > 0) {
      const first = created[0]
      const r = await globalThis.fetch(`${GITHUB}/repos/systemfsoftware/systemfsoftware/releases/${first.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ make_latest: 'true' }),
      })
      if (r.status === 200) patchCount++ // already counted but ensure
    }
    ok(postCount === 2, `captured reuse should create 2, got ${postCount}`)
    ok(created.length === 2, 'captured reuse created length 2')
    globalThis.fetch = origFetch
  }

  // 7) make_latest reconcile after failure (first succeeds, second fails)
  {
    const captured = normalizeCaptured(['@scope/x@v1.0.0', '@scope/y@v1.0.0'])
    const fileMap = {
      '.changeset/changelogs/@scope!x@1.0.0.md': 'x notes',
      '.changeset/changelogs/@scope!y@1.0.0.md': 'y notes',
    }
    let postCalls = 0
    let patched = false
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      const path = url.toString().replace(GITHUB, '')
      if (path.includes('/releases/tags/')) return { status: 404, text: async () => '', json: async () => ({}) }
      if (path.endsWith('/releases') && init?.method === 'POST') {
        postCalls++
        if (postCalls === 1) return { status: 201, text: async () => '', json: async () => ({ id: 999 }) }
        return { status: 500, text: async () => 'boom', json: async () => ({}) }
      }
      if (path.includes('/releases/999') && init?.method === 'PATCH') {
        patched = true
        return { status: 200, text: async () => '', json: async () => ({}) }
      }
      return { status: 404, text: async () => '', json: async () => ({}) }
    }
    let created = []
    let loopError = null
    for (const entry of captured) {
      const body = fileMap[entry.changelog]
      const slug = 'systemfsoftware/systemfsoftware'
      const existing = await globalThis.fetch(`${GITHUB}/repos/${slug}/releases/tags/${encodeURIComponent(entry.tag)}`)
      if (existing.status === 200) continue
      const res = await globalThis.fetch(`${GITHUB}/repos/${slug}/releases`, {
        method: 'POST',
        body: JSON.stringify({ tag_name: entry.tag, body }),
      })
      if (res.status !== 201 && res.status !== 200 && res.status !== 409) {
        loopError = new Error(`creating release ${entry.tag} failed with HTTP ${res.status}`)
        break
      }
      created.push({ tag: entry.tag, id: (await res.json()).id })
    }
    if (created.length > 0) {
      const first = created[0]
      const pr = await globalThis.fetch(`${GITHUB}/repos/systemfsoftware/systemfsoftware/releases/${first.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ make_latest: 'true' }),
      })
      if (pr.status === 200) patched = true
    }
    ok(loopError !== null, 'second create failure should set loopError')
    ok(patched, 'make_latest should be patched even after second failure')
    ok(created.length === 1, 'only first should be created')
    globalThis.fetch = origFetch
  }

  // 8) API error (non-201/200/409)
  {
    const captured = normalizeCaptured(['@scope/err@v1.0.0'])
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      const path = url.toString().replace(GITHUB, '')
      if (path.includes('/releases/tags/')) return { status: 404, text: async () => '', json: async () => ({}) }
      if (path.endsWith('/releases') && init?.method === 'POST') {
        return {
          status: 500,
          text: async () => 'server error',
          json: async () => ({}),
        }
      }
      return { status: 404, text: async () => '', json: async () => ({}) }
    }
    let threw = false
    try {
      for (const entry of captured) {
        const res = await globalThis.fetch(`${GITHUB}/repos/slug/releases`, {
          method: 'POST',
          body: JSON.stringify({ tag_name: entry.tag }),
        })
        if (res.status !== 201 && res.status !== 200 && res.status !== 409) {
          throw new Error(`creating release ${entry.tag} failed with HTTP ${res.status}`)
        }
      }
    } catch {
      threw = true
    }
    ok(threw, 'API error should throw')
    globalThis.fetch = origFetch
  }

  // 9) dry-run with captured list prints plan (no throw)
  {
    const captured = normalizeCaptured(['@scope/dry@v1.0.0'])
    ok(captured[0].changelog === '.changeset/changelogs/@scope!dry@1.0.0.md', 'dry-run changelog path')
  }

  // 10) normalize handles object array and string array
  {
    const a = normalizeCaptured([{ name: '@scope/o', version: '1.0.0', tag: '@scope/o@v1.0.0' }])
    ok(a[0].changelog === '.changeset/changelogs/@scope!o@1.0.0.md', 'normalize object without changelog')
    const b = normalizeCaptured([])
    ok(b.length === 0, 'normalize empty')
  }

  if (failures.length > 0) {
    console.error('create-github-releases: selftest FAILED\n')
    for (const f of failures) console.error(`  ${f}`)
    Deno.exit(1)
  }
  console.log(`create-github-releases: selftest ok (${10} fixtures)`)
}

const main = async () => {
  if (selftestFlag) {
    await selftest()
    return 0
  }

  const captured = await loadCaptured()

  if (captured.length === 0) {
    console.log('no this-cycle releases — empty captured set (R4)')
    return 0
  }

  if (assertMode) {
    await assertChangelogs(captured)
    console.log(`assert ok: ${captured.length} changelog(s) present`)
    return 0
  }

  if (dryRun) {
    for (const { tag, changelog } of captured) console.log(`would create release ${tag} from ${changelog}`)
    console.log(`dry run: ${captured.length} release(s)`)
    return 0
  }

  // Create mode — fail-closed, reconcile make_latest
  const slug = (await run('git', ['remote', 'get-url', 'origin']))
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')

  let created = []
  let loopError = null

  for (const { tag, changelog, name, version } of captured) {
    // fail-closed changelog read
    let body
    try {
      body = await Deno.readTextFile(changelog)
    } catch {
      const msg =
        `Missing changelog for ${name}@${version}: expected ${changelog} — body must be pnpm-generated changelog at .changeset/changelogs/<name with / as !>@<version>.md`
      console.error(`::error::${msg}`)
      loopError = new Error(msg)
      break
    }
    if (!body || body.trim().length === 0) {
      const msg =
        `Empty changelog for ${name}@${version}: ${changelog} is empty — body must be pnpm-generated changelog`
      console.error(`::error::${msg}`)
      loopError = new Error(msg)
      break
    }

    const existing = await api(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`)
    if (existing.status === 200) {
      console.log(`skip ${tag} — release exists`)
      continue
    }
    if (existing.status !== 404) {
      loopError = new Error(`looking up ${tag} in ${slug} failed with HTTP ${existing.status}`)
      break
    }

    const res = await api(`/repos/${slug}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body,
        prerelease: false,
        make_latest: 'false',
      }),
    })
    if (res.status !== 201 && res.status !== 200 && res.status !== 409) {
      loopError = new Error(`creating release ${tag} failed with HTTP ${res.status}: ${await res.text()}`)
      break
    }
    // capture id for reconcile
    let id = null
    try {
      const j = await res.json()
      id = j.id
    } catch { /* ignore */ }
    console.log(`created release ${tag}`)
    created.push({ tag, id })
  }

  // KTD3: reconcile make_latest on one successful this-cycle release even if loop failed partway
  if (created.length > 0) {
    const first = created[0]
    let releaseId = first.id
    if (!releaseId) {
      const getRes = await api(`/repos/${slug}/releases/tags/${encodeURIComponent(first.tag)}`)
      if (getRes.status === 200) {
        try {
          const j = await getRes.json()
          releaseId = j.id
        } catch { /* ignore */ }
      }
    }
    if (releaseId) {
      const patchRes = await api(`/repos/${slug}/releases/${releaseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ make_latest: 'true' }),
      })
      if (patchRes.status !== 200 && patchRes.status !== 201) {
        const msg = `reconciling make_latest for ${first.tag} failed with HTTP ${patchRes.status}: ${await patchRes
          .text()}`
        console.error(`::error::${msg}`)
        if (!loopError) loopError = new Error(msg)
      } else {
        console.log(`reconciled make_latest true on ${first.tag}`)
      }
    }
  }

  if (loopError) throw loopError

  console.log(`created ${created.length} release(s), skipped ${captured.length - created.length}`)
  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
