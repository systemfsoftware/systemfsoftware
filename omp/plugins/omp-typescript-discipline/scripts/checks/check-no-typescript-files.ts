#!/usr/bin/env -S deno run --allow-read=omp/plugins/omp-typescript-discipline
import { join } from '@std/path'

const root = new URL('../..', import.meta.url).pathname
const exts: Record<string, true> = {
  '.ts': true,
  '.tsx': true,
  '.mts': true,
  '.cts': true,
}
const ignoreDirs: Record<string, true> = {
  'node_modules': true,
  '.git': true,
  'dist': true,
  'scripts': true,
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of Deno.readDirSync(dir)) {
    if (ignoreDirs[entry.name]) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory) walk(full, out)
    else if (entry.isFile) {
      const dot = entry.name.lastIndexOf('.')
      const ext = dot >= 0 ? entry.name.slice(dot) : ''
      if (exts[ext]) out.push(full)
    }
  }
  return out
}

const found = walk(root)
if (found.length > 0) {
  const enc = new TextEncoder()
  await Deno.stderr.write(enc.encode(
    `FAIL: omp-typescript-discipline must not contain TypeScript files — found ${found.length}:\n` +
      found.map((p) => `  - ${p.replace(root + '/', '')}`).join('\n') + '\n',
  ))
  Deno.exit(1)
}
await Deno.stdout.write(new TextEncoder().encode('OK: no TypeScript files\n'))
