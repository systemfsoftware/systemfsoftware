#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read
// tag-released-packages.mjs — idempotently tag name@v<version> for every
// non-private workspace package whose tag is absent from the remote, then push.
// Unchanged packages already have their tag and are skipped. Invoked by the
// Release workflow's publish job after a successful publish.

const dec = new TextDecoder()
// Fail closed: a failed git/pnpm command must stop the release, not report
// success while the remote was never reached. stderr is inherited so the
// failure message is already visible; this only converts it to a non-zero exit.
const run = (cmd, args) => {
  const out = new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'inherit' }).outputSync()
  if (!out.success) {
    console.error(`::error::${cmd} ${args.join(' ')} failed (exit ${out.code})`)
    Deno.exit(1)
  }
  return out
}

const pkgs = JSON.parse(dec.decode(run('pnpm', ['ls', '-r', '--json', '--depth=-1']).stdout))

const remote = new Set(
  dec.decode(run('git', ['ls-remote', '--tags', 'origin']).stdout)
    .split('\n').filter(Boolean)
    .map((l) => l.replace(/.*refs\/tags\//, '')),
)

const made = []
for (const p of pkgs) {
  if (!p.name || p.private) continue
  const tag = `${p.name}@v${p.version}`
  if (!remote.has(tag)) {
    run('git', ['tag', tag])
    made.push(tag)
  }
}

if (made.length) {
  run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
  console.log(`pushed ${made.length} tag(s): ${made.join(', ')}`)
} else {
  console.log('no new tags to push')
}
