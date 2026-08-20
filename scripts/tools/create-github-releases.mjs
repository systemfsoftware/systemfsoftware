#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read --allow-net=api.github.com --allow-env=GH_TOKEN,GITHUB_TOKEN
// create-github-releases.mjs — idempotently create a GitHub Release for every
// non-private workspace package whose `name@v<version>` tag exists on the
// remote and whose authored changelog exists under .changeset/changelogs/,
// using that changelog as the release body. Tags without a changelog (release
// history older than the changelog machine) and tags that already have a
// release are skipped, so the run is safe to repeat and heals gaps from
// earlier releases. Invoked by the Release workflow's publish job after
// tagging; `--dry-run` lists the plan without writing.

const dec = new TextDecoder()

// Fail closed: a failed git/pnpm command must stop the run, not report success
// while the remote was never reached. stderr is inherited so the failure is
// already visible; this only converts it to a non-zero exit.
const run = async (cmd, args) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  return dec.decode(out.stdout)
}

const GITHUB = 'https://api.github.com'

const token = Deno.env.get('GITHUB_TOKEN') ?? Deno.env.get('GH_TOKEN') ?? ''
const dryRun = Deno.args.includes('--dry-run')

const api = async (path, init) => {
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

const main = async () => {
  const slug = (await run('git', ['remote', 'get-url', 'origin']))
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')

  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1']))

  const remoteTags = new Set(
    (await run('git', ['ls-remote', '--tags', 'origin']))
      .split('\n').filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, '')),
  )

  const planned = []
  for (const p of pkgs) {
    if (!p.name || p.private || !p.version) continue
    const tag = `${p.name}@v${p.version}`
    if (!remoteTags.has(tag)) continue
    // `pnpm version -r` encodes the scope's `/` as `!` in changelog filenames.
    const changelog = `.changeset/changelogs/${p.name.replace('/', '!')}@${p.version}.md`
    if (!await Deno.stat(changelog).then(() => true).catch(() => false)) continue
    planned.push({ tag, changelog })
  }

  if (dryRun) {
    for (const { tag, changelog } of planned) console.log(`would create release ${tag} from ${changelog}`)
    console.log(`dry run: ${planned.length} release(s)`)
    return 0
  }

  let created = 0
  for (const { tag, changelog } of planned) {
    const existing = await api(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`)
    if (existing.status === 200) {
      console.log(`skip ${tag} — release exists`)
      continue
    }
    if (existing.status !== 404) {
      throw new Error(`looking up ${tag} in ${slug} failed with HTTP ${existing.status}`)
    }
    const body = await Deno.readTextFile(changelog)
    const res = await api(`/repos/${slug}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body,
        prerelease: false,
        // One release per package per cycle: any single "latest" pointer would
        // be an arbitrary package's, so none is set.
        make_latest: 'false',
      }),
    })
    // 409 covers a race with a concurrent run creating the same release.
    if (res.status !== 201 && res.status !== 200 && res.status !== 409) {
      throw new Error(`creating release ${tag} failed with HTTP ${res.status}: ${await res.text()}`)
    }
    console.log(`created release ${tag}`)
    created++
  }

  console.log(`created ${created} release(s), skipped ${planned.length - created}`)
  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
