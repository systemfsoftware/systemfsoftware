import { assert, assertEquals } from '@std/assert'
import { countPendingIntents } from './pending-intents.ts'

const PATCH = `---\n"@scope/pkg": patch\n---\n\n- change\n`

const isStemList = (intents: readonly string[] | Readonly<Record<string, string>>): intents is readonly string[] =>
  Array.isArray(intents)

/** Write `ledger` + `intents` into a throwaway `.changeset` dir and count. */
const countWith = async (
  ledger: string | null,
  intents: readonly string[] | Readonly<Record<string, string>>,
): Promise<number> => {
  const dir = await Deno.makeTempDir()
  const changeset = `${dir}/.changeset`
  await Deno.mkdir(changeset)
  await Deno.writeTextFile(`${changeset}/README.md`, 'not an intent')
  const files: Readonly<Record<string, string>> = isStemList(intents)
    ? Object.fromEntries(intents.map((stem) => [stem, PATCH]))
    : intents
  for (const [stem, content] of Object.entries(files)) {
    await Deno.writeTextFile(`${changeset}/${stem}.md`, content)
  }
  if (ledger !== null) await Deno.writeTextFile(`${changeset}/ledger.yaml`, ledger)
  const pending = await countPendingIntents(changeset)
  await Deno.remove(dir, { recursive: true })
  return pending
}

const MAPPING = `"@scope/pkg@1.0.1":\n  dir: packages/pkg\n  intents:\n    - twenty-vans-prove\n`
const SEQUENCE = `"@scope/pkg@1.0.1":\n  - twenty-vans-prove\n`
const NULL_VALUE = `"@scope/pkg@1.0.1":\n`
const NON_STRING_INTENT = `"@scope/pkg@1.0.1":\n  dir: packages/pkg\n  intents:\n    - 7\n`

Deno.test('a consumed stem is not pending', async () => {
  assertEquals(await countWith(MAPPING, ['twenty-vans-prove']), 0)
})

Deno.test('a stem the ledger does not record is pending', async () => {
  assertEquals(await countWith(MAPPING, ['twenty-vans-prove', 'cyan-wombats-own']), 1)
})

Deno.test('a bare sequence records its stems as consumed', async () => {
  assertEquals(await countWith(SEQUENCE, ['twenty-vans-prove']), 0)
})

Deno.test('a null value is an empty intent list, not an unparsed entry', async () => {
  assertEquals(await countWith(NULL_VALUE, ['twenty-vans-prove']), 1)
})

Deno.test('a non-string intent contributes nothing', async () => {
  assertEquals(await countWith(NON_STRING_INTENT, ['twenty-vans-prove']), 1)
})

Deno.test('an absent ledger leaves every intent pending', async () => {
  assertEquals(await countWith(null, ['a', 'b']), 2)
})

Deno.test('a malformed ledger degrades to nothing consumed, never to fewer pending', async () => {
  const pending = await countWith('"@scope/pkg@1.0.1": [ "a",\n  : bad: yaml\n', ['a', 'b'])
  assertEquals(pending, 2)
  assert(pending >= 1)
})

Deno.test('an intent whose every bump is none requests no release, so it is not pending', async () => {
  assertEquals(await countWith(null, { quiet: `---\n"@scope/a": none\n"@scope/b": none\n---\n\nbody\n` }), 0)
})

Deno.test('an intent with one real bump among none bumps is pending', async () => {
  assertEquals(await countWith(null, { mixed: `---\n"@scope/a": none\n"@scope/b": patch\n---\n\nbody\n` }), 1)
})

Deno.test('an intent whose frontmatter cannot be read stays pending', async () => {
  const pending = await countWith(null, {
    bare: 'no frontmatter\n',
    empty: '---\n---\n',
    malformed: '---\n"@scope/a": [ none,\n  : bad\n---\n',
  })
  assertEquals(pending, 3)
})
