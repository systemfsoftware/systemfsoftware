import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import * as Arr from 'effect/Array'
import * as Schema from 'effect/Schema'

import { TestId } from '../report/report.schema.js'
import { ResultDirectory } from './artifact.schema.js'

export interface ResultDirectoryRequest {
  readonly title: string
  readonly test: TestId
  readonly target: string
  readonly agent: string
}

const hashOf = (test: TestId, target: string, agent: string): string =>
  bytesToHex(sha256(utf8ToBytes(JSON.stringify([test, target, agent])))).slice(0, 8)

const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
    .replace(/-+$/u, '')

export const resultDirectoryOf = (request: ResultDirectoryRequest): ResultDirectory =>
  ResultDirectory.make(
    [slugOf(request.title), hashOf(request.test, request.target, request.agent)]
      .filter((part) => part.length > 0)
      .join('-'),
  )

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const escapesResults = (directory: string): boolean =>
    Arr.every(['/', '\\', '..'], (segment) => !directory.includes(segment))

  const differsUnlessEqual = (
    drawn: string,
    original: string,
    changed: ResultDirectory,
    base: ResultDirectory,
  ): boolean => drawn === original || changed !== base

  const EIGHT_HEX = /^[0-9a-f]{8}$/u

  it.prop(
    '∀r_ResultDirectoryRequest_→DirectoryDecodesAndStaysInsideResults',
    {
      of: [Schema.String, TestId, Schema.String, Schema.String, TestId],
      subject: resultDirectoryOf,
      arbitrary: { seed: 508_001 },
    },
    (subject, [title, test, target, agent, otherTest]) => {
      const named = subject({ title, test, target, agent })
      const checks = [
        Schema.is(ResultDirectory)(named),
        escapesResults(named),
        differsUnlessEqual(otherTest, test, subject({ title, test: otherTest, target, agent }), named),
      ]
      return Arr.every(checks, (check) => check)
    },
  )

  it.prop(
    '∀r_ResultDirectoryRequest_→SameRequestNamesSameDirectory',
    {
      of: [Schema.String, TestId, Schema.String, Schema.String, Schema.String],
      subject: resultDirectoryOf,
      arbitrary: { seed: 508_002 },
    },
    (subject, [title, test, target, agent, otherTarget]) => {
      const named = subject({ title, test, target, agent })
      return named === subject({ title, test, target, agent }) &&
        differsUnlessEqual(otherTarget, target, subject({ title, test, target: otherTarget, agent }), named)
    },
  )

  it.prop(
    '∀r_ResultDirectoryRequest_→DifferingTestNamesDifferingDirectory',
    {
      of: [Schema.String, TestId, Schema.String, Schema.String, TestId],
      subject: resultDirectoryOf,
      arbitrary: { seed: 508_003 },
    },
    (subject, [title, test, target, agent, otherTest]) =>
      differsUnlessEqual(
        otherTest,
        test,
        subject({ title, test: otherTest, target, agent }),
        subject({ title, test, target, agent }),
      ),
  )

  it.prop(
    '∀r_ResultDirectoryRequest_→DifferingTargetNamesDifferingDirectory',
    {
      of: [Schema.String, TestId, Schema.String, Schema.String, Schema.String],
      subject: resultDirectoryOf,
      arbitrary: { seed: 508_004 },
    },
    (subject, [title, test, target, agent, otherTarget]) =>
      differsUnlessEqual(
        otherTarget,
        target,
        subject({ title, test, target: otherTarget, agent }),
        subject({ title, test, target, agent }),
      ),
  )

  it.prop(
    '∀r_ResultDirectoryRequest_→DifferingAgentNamesDifferingDirectory',
    {
      of: [Schema.String, TestId, Schema.String, Schema.String, Schema.String],
      subject: resultDirectoryOf,
      arbitrary: { seed: 508_005 },
    },
    (subject, [title, test, target, agent, otherAgent]) =>
      differsUnlessEqual(
        otherAgent,
        agent,
        subject({ title, test, target, agent: otherAgent }),
        subject({ title, test, target, agent }),
      ),
  )

  it.prop(
    '∀r_ResultDirectoryRequest_≡TitledDirectoryIsSlugPlusEightHex',
    { of: [TestId, Schema.String, Schema.String], subject: resultDirectoryOf, arbitrary: { seed: 508_006 } },
    (subject, [test, target, agent]) => {
      const titled = subject({ title: 'Saves the profile / ../etc', test, target, agent })
      return titled.startsWith('saves-the-profile-etc-') &&
        EIGHT_HEX.test(titled.slice('saves-the-profile-etc-'.length))
    },
  )

  it.prop(
    '∀r_ResultDirectoryRequest_≡SymbolOnlyTitleNamesEightHex',
    { of: [TestId, Schema.String, Schema.String], subject: resultDirectoryOf, arbitrary: { seed: 508_007 } },
    (subject, [test, target, agent]) => EIGHT_HEX.test(subject({ title: '///', test, target, agent })),
  )
}
