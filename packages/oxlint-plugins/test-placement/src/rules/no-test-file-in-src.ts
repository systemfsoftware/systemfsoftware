import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  type Detail,
  meta,
  Options,
  propertyTestLocationDetail,
  SCHEMA_TEST_DETAIL,
  testFileInSrcDetail,
} from './no-test-file-in-src.config.js'
import { PROPERTY_SUFFIX, SCHEMA_LAWS_BASENAME, SCHEMA_SUFFIX } from './path.config.js'
import { basenameOf, isInConfiguredTestDir, isTestFile, isUnderSrc, namesColocatableCell, testStem } from './path.js'

export type MessageIds = 'testFileInSrc' | 'schemaTestInSrc' | 'propertyTestOutsideTestsDir'

const violationOf = (basename: string, isPropertyTest: boolean, dir: string): readonly [MessageIds, Detail] =>
  basename.endsWith(SCHEMA_SUFFIX)
    ? ['schemaTestInSrc', SCHEMA_TEST_DETAIL]
    : isPropertyTest
    ? ['propertyTestOutsideTestsDir', propertyTestLocationDetail(dir)]
    : ['testFileInSrc', testFileInSrcDetail(dir)]

export const noTestFileInSrc = defineRule({
  meta,
  create(context: Context) {
    const { sanctionedDirs } = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const basename = basenameOf(context.filename)
    if (!isUnderSrc(context.filename)) return {}
    if (!isTestFile(basename)) return {}
    if (basename === SCHEMA_LAWS_BASENAME) return {}
    const isPropertyTest = basename.endsWith(PROPERTY_SUFFIX)
    const isSchemaTest = basename.endsWith(SCHEMA_SUFFIX)
    const colocated = isInConfiguredTestDir(context.filename, sanctionedDirs)
    if (!isSchemaTest && colocated && namesColocatableCell(testStem(basename))) return {}
    const [messageId, detail] = violationOf(basename, isPropertyTest, sanctionedDirs[0])
    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId,
          data: { name: basename, ...detail },
        })
      },
    }
  },
})
