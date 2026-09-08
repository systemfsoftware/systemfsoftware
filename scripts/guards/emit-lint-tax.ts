#!/usr/bin/env -S deno run --allow-read
const RULE_ID = /([a-z0-9@/.-]+)\(([a-z0-9-]+)\):/g

export const countFirings = (text: string): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {}
  for (const match of text.matchAll(RULE_ID)) {
    const rule = `${match[1]}/${match[2]}`
    counts[rule] = (counts[rule] ?? 0) + 1
  }
  return counts
}

const selftest = (): number => {
  const counts = countFirings(
    'src/a.ts:1:2: error @systemfsoftware/effect-dmmf(no-zero-arm-schema): x\n' +
      'src/b.ts:3:4: error @systemfsoftware/effect-dmmf(no-zero-arm-schema): y\n' +
      'src/c.ts:5:6: error @systemfsoftware(no-hand-curried-export): z\n',
  )
  const zeroArm = counts['@systemfsoftware/effect-dmmf/no-zero-arm-schema'] === 2
  const curried = counts['@systemfsoftware/no-hand-curried-export'] === 1
  console.log(`selftest: zero-arm-pairs=${zeroArm} curried-ones=${curried}`)
  return zeroArm && curried ? 0 : 1
}

if (Deno.args.includes('--selftest')) {
  Deno.exit(selftest())
}

const text = await new Response(Deno.stdin.readable).text()
const counts = countFirings(text)
const total = Object.values(counts).reduce((a, b) => a + b, 0)
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
for (const [rule, count] of sorted) {
  console.log(`${String(count).padStart(5)}  ${rule}`)
}
console.log(JSON.stringify({ total, gap: 'tokens-per-firing is not observable from oxlint' }))
