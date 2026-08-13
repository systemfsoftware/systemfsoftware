#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read
// tag-released-packages.mjs — idempotently tag name@v<version> for every
// non-private workspace package whose tag is absent from the remote, then push.
// Unchanged packages already have their tag and are skipped. Invoked by the
// Release workflow's publish job after a successful publish.

const dec = new TextDecoder()

// Fail closed: a failed git/pnpm command must stop the release, not report
// success while the remote was never reached. stderr is inherited so the
// failure message is already visible; this only converts it to a non-zero exit.
const run = async (cmd, args) => {
  const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).output()
  if (!out.success) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${out.code})`)
  }
  return dec.decode(out.stdout)
}

const main = async () => {
  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1']))

  const remote = new Set(
    (await run('git', ['ls-remote', '--tags', 'origin']))
      .split('\n').filter(Boolean)
      .map((l) => l.replace(/.*refs\/tags\//, '')),
  )

  // Deliberately serial: concurrent `git tag` invocations contend for the ref
  // store and packed-refs. Never convert this loop to Promise.all.
  const made = []
  for (const p of pkgs) {
    if (!p.name || p.private) continue
    const tag = `${p.name}@v${p.version}`
    if (!remote.has(tag)) {
      await run('git', ['tag', tag])
      made.push(tag)
    }
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
  console.error(`::error::${error.message}`)
  Deno.exitCode = 1
}
