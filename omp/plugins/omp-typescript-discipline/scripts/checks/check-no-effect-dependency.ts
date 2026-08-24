#!/usr/bin/env -S deno run --allow-read=omp/plugins/omp-typescript-discipline/package.json
const pkgPath = new URL('../../package.json', import.meta.url)
const pkg = JSON.parse(await Deno.readTextFile(pkgPath))
const deps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
  ...pkg.peerDependencies,
  ...pkg.optionalDependencies,
}
if ('effect' in deps) {
  await Deno.stderr.write(
    new TextEncoder().encode(
      `FAIL: omp-typescript-discipline/package.json must not depend on "effect" — found "${deps.effect}"\n`,
    ),
  )
  Deno.exit(1)
}
await Deno.stdout.write(new TextEncoder().encode('OK: no effect dependency\n'))
