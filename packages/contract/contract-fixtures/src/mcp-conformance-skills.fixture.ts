import type { McpExtension, McpExtensionReply } from '@systemfsoftware/effect-contract/mcp'
import { Context, Effect, Match, Option, Schema } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'

export const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills'

const AUTHORITY = 'mcp-conformance'
const SKILL_NAME = 'demo-skill'
const SKILL_DESCRIPTION = 'A demo skill served by the conformance fixture.'
const ROOT_URI = `skill://${AUTHORITY}/${SKILL_NAME}`
const MANIFEST_URI = `${ROOT_URI}/SKILL.md`
const REFERENCES_URI = `${ROOT_URI}/references`
const NOTES_URI = `${REFERENCES_URI}/notes.md`
const MARKDOWN = 'text/markdown'
const DIRECTORY = 'inode/directory'
const TTL_MS = 3_600_000
const INVALID_PARAMS = -32602

const MANIFEST_TEXT = `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

# ${SKILL_NAME}

The skill the conformance fixture serves over the SEP-2640 surface.
`

const NOTES_TEXT = `# Reference notes

Notes for the ${SKILL_NAME} skill.
`

type Server = McpServer.McpServer['Service']

const encode = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(Array.from(new TextEncoder().encode(text)))

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const digestOf = (text: string): Effect.Effect<string> =>
  Effect.promise(() =>
    globalThis.crypto.subtle
      .digest('SHA-256', encode(text))
      .then((hash) => `sha256:${hexOf(new Uint8Array(hash))}`)
  )

const resourceTriple = (uri: string, text: string): Effect.Effect<Schema.JsonObject> =>
  Effect.map(digestOf(text), (digest): Schema.JsonObject => ({ uri, digest, size: encode(text).length }))

const skillEntry = (): Effect.Effect<Schema.JsonObject> =>
  Effect.gen(function*() {
    const manifest = yield* resourceTriple(MANIFEST_URI, MANIFEST_TEXT)
    const notes = yield* resourceTriple(NOTES_URI, NOTES_TEXT)
    return {
      uri: MANIFEST_URI,
      frontmatter: { name: SKILL_NAME, description: SKILL_DESCRIPTION },
      resources: [manifest, notes],
    }
  })

const resultReply = (value: Schema.JsonObject): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Effect.succeedSome({ _tag: 'ExtensionResult', result: value })

const errorReply = (code: number, message: string): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Effect.succeedSome({ _tag: 'ExtensionError', code, message })

const declined: Effect.Effect<Option.Option<never>> = Effect.succeedNone

const stringFieldOf = (object: Schema.JsonObject, key: string): Option.Option<string> =>
  Schema.decodeUnknownOption(Schema.String)(object[key] ?? null)

const uriOf = (params: Option.Option<Schema.JsonObject>): Option.Option<string> =>
  Option.flatMap(params, (value) => stringFieldOf(value, 'uri'))

const listReply = (): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Effect.flatMap(
    skillEntry(),
    (entry) => resultReply({ resultType: 'complete', skills: [entry], ttlMs: TTL_MS, cacheScope: 'public' }),
  )

const getReply = (uri: string): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Match.value(uri === MANIFEST_URI).pipe(
    Match.when(false, () => errorReply(INVALID_PARAMS, `No skill served at ${uri}`)),
    Match.orElse(() =>
      Effect.flatMap(
        skillEntry(),
        (entry) => resultReply({ resultType: 'complete', skill: entry, ttlMs: TTL_MS, cacheScope: 'public' }),
      )
    ),
  )

const childOf = (uri: string, name: string, mimeType: string): Schema.JsonObject => ({ uri, name, mimeType })

const DIRECTORY_CHILDREN: Readonly<Record<string, ReadonlyArray<Schema.JsonObject>>> = {
  [ROOT_URI]: [
    childOf(MANIFEST_URI, 'SKILL.md', MARKDOWN),
    childOf(REFERENCES_URI, 'references', DIRECTORY),
  ],
  [REFERENCES_URI]: [childOf(NOTES_URI, 'notes.md', MARKDOWN)],
}

const directoryReply = (uri: string): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Option.match(Option.fromUndefinedOr(DIRECTORY_CHILDREN[uri]), {
    onNone: () => errorReply(INVALID_PARAMS, `${uri} is not a directory this server serves`),
    onSome: (children) => resultReply({ resultType: 'complete', resources: children }),
  })

const directoryRequest = (params: Option.Option<Schema.JsonObject>): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Option.match(uriOf(params), {
    onNone: () => errorReply(INVALID_PARAMS, 'uri must be a string'),
    onSome: (uri) => directoryReply(uri),
  })

const getRequest = (params: Option.Option<Schema.JsonObject>): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Option.match(uriOf(params), {
    onNone: () => errorReply(INVALID_PARAMS, 'uri must be a string'),
    onSome: (uri) => getReply(uri),
  })

export const skillsExtension: McpExtension = {
  capability: { id: SKILLS_EXTENSION_ID, settings: { directoryRead: true } },
  handle: (request) =>
    Match.value(request.method).pipe(
      Match.when('skills/list', () => listReply()),
      Match.when('skills/get', () => getRequest(request.params)),
      Match.when('resources/directory/read', () => directoryRequest(request.params)),
      Match.orElse(() => declined),
    ),
}

interface SkillFile {
  readonly uri: string
  readonly name: string
  readonly description: string
  readonly text: string
}

const SKILL_FILES: ReadonlyArray<SkillFile> = [
  { uri: MANIFEST_URI, name: SKILL_NAME, description: SKILL_DESCRIPTION, text: MANIFEST_TEXT },
  { uri: NOTES_URI, name: 'notes.md', description: 'Reference notes for the demo skill.', text: NOTES_TEXT },
]

export const registerSkillResources = (server: Server): Effect.Effect<void> =>
  Effect.forEach(
    SKILL_FILES,
    (file) =>
      server.addResource({
        resource: new McpSchema.Resource({
          uri: file.uri,
          name: file.name,
          description: file.description,
          mimeType: MARKDOWN,
        }),
        annotations: Context.empty(),
        handle: Effect.succeed(
          McpSchema.ReadResourceResult.make({
            contents: [{ uri: file.uri, mimeType: MARKDOWN, text: file.text }],
          }),
        ),
      }),
    { discard: true },
  )
