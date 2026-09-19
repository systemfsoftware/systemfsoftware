import { assert, assertEquals } from '@std/assert'
import { countPendingIntents } from './pending-intents.ts'

/** Write `ledger` + `intents` into a throwaway `.changeset` dir and count. */
const countWith = async (
  ledger: string | null,
  intents: readonly string[],
): Promise<number> => {
  const dir = await Deno.makeTempDir()
  const changeset = `${dir}/.changeset`
  await Deno.mkdir(changeset)
  await Deno.writeTextFile(`${changeset}/README.md`, 'not an intent')
  for (const stem of intents) {
    await Deno.writeTextFile(`${changeset}/${stem}.md`, `---\n"@scope/pkg": patch\n---\n\n- change\n`)
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
