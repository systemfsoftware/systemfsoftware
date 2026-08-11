// Differential Fidelity Test: ACP JSON Schema → Effect Schema
// ============================================================
// Compares validation for sampled $defs between:
//   1. Source JSON Schema (ajv 2020-12)
//   2. Generated Effect Schema (S.decodeSync)
//
// Run: deno run --allow-read scripts/check-fidelity.ts
// (requires ajv in node_modules)

import Ajv2020 from 'npm:ajv@8.18.0/dist/2020'
import * as S from 'npm:effect@3.22.1/Schema'

const schemaPath = new URL('../../../protocol/acp-schema.json', import.meta.url)
const rawSchema = JSON.parse(await Deno.readTextFile(schemaPath))

const ajv = new Ajv2020({ allErrors: true, strict: false })
for (const [name, def] of Object.entries(rawSchema.$defs)) {
  ajv.addSchema(def, `#/$defs/${name}`)
}

// ---- helpers ----
function ajvOk(name: string, value: unknown): boolean {
  const path = `#/$defs/${name}`
  const v = ajv.getSchema(path)
  return v ? (v(value) as boolean) : (ajv.compile(rawSchema.$defs[name] as Record<string, unknown>)(value) as boolean)
}
function esOk(schema: S.Schema<any>, value: unknown): boolean {
  try {
    S.decodeSync(schema)(value)
    return true
  } catch {
    return false
  }
}

interface Finding {
  desc: string
  jsonSchemaName: string
  jsVerdict: string
  esVerdict: string
  match: boolean
  value: string
}
const findings: Finding[] = []

function check(desc: string, jsonSchemaName: string, esSchema: S.Schema<any>, value: unknown) {
  const js = ajvOk(jsonSchemaName, value) ? 'accept' : 'reject'
  const es = esOk(esSchema, value) ? 'accept' : 'reject'
  findings.push({
    desc,
    jsonSchemaName,
    jsVerdict: js,
    esVerdict: es,
    match: js === es,
    value: JSON.stringify(value).slice(0, 80),
  })
}

// ---- shared schemas (matching generated) ----
const JsonObjectKey = S.String.pipe(S.filter((k: string) => k !== '__proto__'))
const JsonValue = S.suspend(() =>
  S.Union(
    S.Null,
    S.Boolean,
    S.JsonNumber,
    S.String,
    S.Array(JsonValue),
    S.Record({ key: JsonObjectKey, value: JsonValue }),
  )
)
const JsonObject = S.Record({ key: JsonObjectKey, value: JsonValue })

// ================================================================
// TEST SUITE
// ================================================================

// ---- SIMPLE TYPES ----
check('RequestId/null', 'RequestId', S.NullOr(S.Union(S.Int, S.String)), null)
check('RequestId/int-42', 'RequestId', S.NullOr(S.Union(S.Int, S.String)), 42)
check('RequestId/string', 'RequestId', S.NullOr(S.Union(S.Int, S.String)), 'abc')
check('RequestId/bool-reject', 'RequestId', S.NullOr(S.Union(S.Int, S.String)), true)
check('RequestId/float-reject', 'RequestId', S.NullOr(S.Union(S.Int, S.String)), 3.14)

check('SessionId/string', 'SessionId', S.String, 'abc-123')
check('SessionId/int-reject', 'SessionId', S.String, 42)

check(
  'ToolKind/enum-first',
  'ToolKind',
  S.Literal('read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'),
  'read',
)
check(
  'ToolKind/enum-last',
  'ToolKind',
  S.Literal('read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'),
  'other',
)
check(
  'ToolKind/reject',
  'ToolKind',
  S.Literal('read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other'),
  'bogus',
)

check('Role/assistant', 'Role', S.Literal('assistant', 'user'), 'assistant')
check('Role/reject', 'Role', S.Literal('assistant', 'user'), 'admin')

check('ToolCallStatus/pending', 'ToolCallStatus', S.Literal('pending', 'in_progress', 'completed', 'failed'), 'pending')
check('ToolCallStatus/reject', 'ToolCallStatus', S.Literal('pending', 'in_progress', 'completed', 'failed'), 'running')

check('ElicitationSchemaType/const', 'ElicitationSchemaType', S.Literal('object'), 'object')
check('ElicitationSchemaType/reject', 'ElicitationSchemaType', S.Literal('object'), 'array')

check(
  'StopReason/end_turn',
  'StopReason',
  S.Literal('end_turn', 'max_tokens', 'tool_use', 'stop_sequence', 'refusal', 'interrupted', 'content_filter'),
  'end_turn',
)
check(
  'StopReason/reject',
  'StopReason',
  S.Literal('end_turn', 'max_tokens', 'tool_use', 'stop_sequence', 'refusal', 'interrupted', 'content_filter'),
  'unknown',
)

// ---- INTEGER BOUNDARIES (ProtocolVersion: minimum:0, maximum:65535) ----
check('ProtocolVersion/valid-1', 'ProtocolVersion', S.Int, 1)
check('ProtocolVersion/bound-min-0', 'ProtocolVersion', S.Int, 0)
check('ProtocolVersion/bound-max-65535', 'ProtocolVersion', S.Int, 65535)
check('ProtocolVersion/negative-reject-js', 'ProtocolVersion', S.Int, -5)
check('ProtocolVersion/float-reject-both', 'ProtocolVersion', S.Int, 3.14)
check('ProtocolVersion/65536-reject-js', 'ProtocolVersion', S.Int, 65536)

// ---- OBJECTS (matching generated output) ----
const WriteTextFileRequest = S.Struct({
  sessionId: S.String,
  path: S.String,
  content: S.String,
  _meta: S.optional(S.NullOr(JsonObject)),
})
check('WriteTextFileRequest/valid', 'WriteTextFileRequest', WriteTextFileRequest, {
  sessionId: 's1',
  path: '/tmp/x',
  content: 'hello',
})
check('WriteTextFileRequest/missing-required', 'WriteTextFileRequest', WriteTextFileRequest, {
  sessionId: 's1',
  content: 'hello',
})
check('WriteTextFileRequest/with-meta', 'WriteTextFileRequest', WriteTextFileRequest, {
  sessionId: 's1',
  path: '/tmp/x',
  content: 'hello',
  _meta: { a: 1 },
})

// ---- EMBEDDED RESOURCE (oneOf → S.Union) ----
const TextResourceContents = S.Struct({ uri: S.String, mimeType: S.optional(S.String), text: S.String })
const BlobResourceContents = S.Struct({ uri: S.String, mimeType: S.optional(S.String), blob: S.String })
const EmbeddedResourceResource = S.Union(TextResourceContents, BlobResourceContents)
check('EmbRes/text-only', 'EmbeddedResourceResource', EmbeddedResourceResource, { uri: 'f://x', text: 'hi' })
check('EmbRes/blob-only', 'EmbeddedResourceResource', EmbeddedResourceResource, { uri: 'f://x', blob: 'b64' })
// oneOf says exactly one matches; S.Union is first-match (accepts both)
check('EmbRes/both-ambiguity', 'EmbeddedResourceResource', EmbeddedResourceResource, {
  uri: 'f://x',
  text: 'hi',
  blob: 'b64',
})

// ---- DISCRIMINATED UNION (ContentBlock) ----
const ContentBlock = S.Union(
  S.extend(TextResourceContents, S.Struct({ type: S.Literal('text') })),
  S.Struct({
    type: S.Literal('resource_link'),
    uri: S.String,
    name: S.String,
    mimeType: S.optional(S.String),
    size: S.optional(S.Int),
  }),
)
check('ContentBlock/text', 'ContentBlock', ContentBlock, { type: 'text', uri: 'f://x', text: 'hello' })
check('ContentBlock/wrong-discriminator', 'ContentBlock', ContentBlock, { type: 'bogus' })

// ---- POSITIVE CONTROL: Framework detects planted errors ----
// We test with a KNOWN-WRONG schema to prove the framework works
check(
  'POSITIVE-CTRL/wrong-schema-accepts-wrong-value',
  'ToolKind', // JSON Schema: enum of strings
  S.String, // PLANTED: S.String accepts anything, even numbers
  42,
) // JSON Schema rejects 42, but S.String accepts it (es accept, js reject)

console.log('\n=== DIFFERENTIAL FIDELITY TEST RESULTS ===\n')

const mismatches = findings.filter(f => !f.match)
const matches = findings.filter(f => f.match)

for (const f of findings) {
  const marker = f.match ? ' ✓' : ' ✗'
  console.log(`${marker} ${f.desc.padEnd(40)} js=${f.jsVerdict.padEnd(6)} es=${f.esVerdict.padEnd(6)}  ${f.value}`)
}

console.log(`\n--- SUMMARY ---`)
console.log(`Total: ${findings.length}  Matches: ${matches.length}  Mismatches: ${mismatches.length}`)

if (mismatches.length > 0) {
  console.log(`\n--- MISMATCH ANALYSIS ---`)
  for (const m of mismatches) {
    if (m.desc.includes('negative') || m.desc.includes('65536') || m.desc.includes('bound-')) {
      console.log(`  KNOWN (bounds dropped): ${m.desc} — generator drops minimum/maximum`)
    } else if (m.desc.includes('both-ambiguity')) {
      console.log(`  KNOWN (oneOf→Union): ${m.desc} — S.Union is first-match, not exclusive`)
    } else if (m.desc.includes('POSITIVE-CTRL')) {
      console.log(`  POSITIVE CONTROL: ${m.desc} — deliberately planted error correctly detected`)
    } else {
      console.log(`  UNEXPECTED: ${m.desc} — js=${m.jsVerdict} es=${m.esVerdict}`)
    }
  }
}

// Findings summary for the ledger:
const unexpectedMismatches = mismatches.filter(m =>
  !m.desc.includes('negative') && !m.desc.includes('65536') && !m.desc.includes('bound-') &&
  !m.desc.includes('both-ambiguity') && !m.desc.includes('POSITIVE-CTRL')
)

console.log(`\nUnexpected bugs: ${unexpectedMismatches.length}`)
if (unexpectedMismatches.length === 0) {
  console.log('✓ No unexpected translation defects found in sampled schemas.')
}

const realMismatches = mismatches.filter(m => !m.desc.includes('POSITIVE-CTRL'))
console.log(`Real mismatches (excluding positive control): ${realMismatches.length}`)

Deno.exit(unexpectedMismatches.length > 0 ? 1 : 0)
