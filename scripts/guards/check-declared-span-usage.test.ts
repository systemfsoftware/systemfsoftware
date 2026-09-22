import { assertEquals } from '@std/assert'
import { census, stripTaxonomyMembership } from './check-declared-span-usage.ts'

const declaration = (name: string) => ({
  path: 'packages/p/src/a.span.ts',
  text:
    `import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'\n\nexport const ${name} = Span.declare({ id: 'x', name: 'x', attrs: Attrs })\n`,
})

const orphanNames = (files: readonly { readonly path: string; readonly text: string }[]) =>
  census(files, files).orphans.map((o) => o.name)

Deno.test('an unused declaration is named as an orphan', () => {
  assertEquals(orphanNames([declaration('Orphan')]), ['Orphan'])
})

Deno.test('a started declaration is used', () => {
  const site = {
    path: 'packages/p/src/b.cell.ts',
    text: `import { Orphan } from './a.span.js'\n\nconst run = Orphan.start({ 'app.id': 'x' })(effect)\n`,
  }
  assertEquals(orphanNames([declaration('Orphan'), site]), [])
})

Deno.test('a declaration observed by a relation is used', () => {
  const spec = {
    path: 'packages/p/tests/b.trace.test.ts',
    text: `import { Orphan } from '../src/a.span.js'\n\nconst rel = Rel.exists(Orphan)\n`,
  }
  assertEquals(orphanNames([declaration('Orphan'), spec]), [])
})

Deno.test('taxonomy membership alone is not a use', () => {
  const membership = {
    path: 'packages/p/src/c.taxonomy.ts',
    text:
      `import { Orphan } from './a.span.js'\n\nexport const T = Taxonomy.make({ id: 't', spans: [Orphan], edges: [], forbid: [] })\n`,
  }
  assertEquals(orphanNames([declaration('Orphan'), membership]), ['Orphan'])
})

Deno.test('a comment or a log string naming the span is not a use', () => {
  const noise = {
    path: 'packages/p/src/d.ts',
    text: `// Orphan is emitted here one day\nconst message = 'Orphan started'\nconst tpl = \`Orphan\`\n`,
  }
  assertEquals(orphanNames([declaration('Orphan'), noise]), ['Orphan'])
})

Deno.test('a member access ending in the name is not a use', () => {
  const shadow = {
    path: 'packages/p/src/e.ts',
    text: `const v = payload.Orphan\n`,
  }
  assertEquals(orphanNames([declaration('Orphan'), shadow]), ['Orphan'])
})

Deno.test('a use outside every taxonomy region survives the membership strip', () => {
  const mixed = `Taxonomy.make({ spans: [A] })\nconst started = A.start({})\n`
  assertEquals(stripTaxonomyMembership(mixed).includes('A.start'), true)
  assertEquals(stripTaxonomyMembership(mixed).includes('spans: [A]'), false)
})
