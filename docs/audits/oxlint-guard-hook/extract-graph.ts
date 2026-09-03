#!/usr/bin/env -S deno run --allow-read=.
/** Extract the module import graph of a TypeScript source tree as JSON + mermaid.
 *
 * Usage: extract-graph.ts <src-dir>
 * Emits JSON: { "module.ts": ["other.ts", ...], ... } on stdout (relative edges only).
 */
const root = Deno.args[0] ?? 'src'

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory) out.push(...await walk(path))
    else if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out.sort()
}

const files = await walk(root)
const graph: Record<string, string[]> = {}
for (const file of files) {
  const text = await Deno.readTextFile(file)
  const edges: string[] = []
  for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const resolved = new URL(match[1], `file:///${file}`).pathname.replace(
      /^\//,
      '',
    )
    edges.push(resolved)
  }
  graph[file] = [...new Set(edges)].sort()
}
console.log(JSON.stringify(graph, null, 2))
