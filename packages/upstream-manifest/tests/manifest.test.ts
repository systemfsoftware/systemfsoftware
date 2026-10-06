import { HashSet } from 'effect'

import { it } from '@systemfsoftware/vitest'

import {
  differingBlobs,
  type Family,
  forkPaths,
  importedSupport,
  judge,
  judgePort,
  packageDir,
  type PortRegion,
  recordedButTracked,
  selectTests,
  unclaimed,
  upstreamDir,
} from '@systemfsoftware/upstream-manifest'

const UP: readonly string[] = ['a', 'b', 'c', 'd', 'e']
const K: readonly PortRegion[] = [{ case: 'k', lines: [2, 2] }]
const KJ: readonly PortRegion[] = [{ case: 'k', lines: [2, 2] }, { case: 'j', lines: [4, 4] }]

const FAMILY: Family = {
  name: 'f',
  reason: 'r',
  source: { ref: 'HEAD', root: 'repos/up/packages/core' },
  tests: ['test/a.test.ts'],
  packages: { '.': { upstream: '.' }, sub: { upstream: 'packages/sub' } },
}

it('Should_AcceptAnExactList_When_EveryListedFileIsExpected', function*({ expect }) {
  yield* expect(judge(['x'], ['x'])._tag).toEqual('Matches')
})

it('Should_RefuseAListedFileTheImportDidNotBring_When_TheListHasAnExtra', function*({ expect }) {
  yield* expect(judge(['x', 'new'], ['x'])._tag).toEqual('Drifted')
})

it('Should_RefuseAnImportedFileWithNoRecord_When_TheExpectedFileIsUnlisted', function*({ expect }) {
  yield* expect(judge([], ['x'])._tag).toEqual('Drifted')
})

it('Should_AcceptAChangedRegion_When_TheChangeSitsInsideIt', function*({ expect }) {
  yield* expect(judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)._tag).toEqual('Faithful')
})

it('Should_AcceptTwoChangedRegions_When_EachChangeSitsInsideItsRegion', function*({ expect }) {
  const port = ['a', '// port:begin k', 'Z', '// port:end', 'c', '// port:begin j', '// port:end', 'e']
  yield* expect(judgePort(UP, port, KJ)._tag).toEqual('Faithful')
})

it('Should_RefuseAChangeBeforeTheRegion_When_AChangeSitsBeforeIt', function*({ expect }) {
  yield* expect(judgePort(UP, ['A', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)._tag).toEqual('Changed')
})

it('Should_RefuseAChangeBetweenRegions_When_AChangeSitsBetweenThem', function*({ expect }) {
  const port = ['a', '// port:begin k', '// port:end', 'C', '// port:begin j', '// port:end', 'e']
  yield* expect(judgePort(UP, port, KJ)._tag).toEqual('Changed')
})

it('Should_RefuseAChangeAfterTheRegion_When_AChangeSitsAfterIt', function*({ expect }) {
  yield* expect(judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'E'], K)._tag).toEqual('Changed')
})

it('Should_RefuseAPortWithoutItsMarkers_When_TheMarkersAreAbsent', function*({ expect }) {
  yield* expect(judgePort(UP, ['a', 'Z', 'c', 'd', 'e'], K)._tag).toEqual('Unmarked')
})

it('Should_SelectOnlyUpstreamTestFiles_When_TheFamilyImportsAllTests', function*({ expect }) {
  yield* expect(selectTests('all', ['src/x.ts', 'test/b.test.ts', 'test/a.test.tsx'])).toEqual({
    _tag: 'Selected',
    tests: ['test/a.test.tsx', 'test/b.test.ts'],
  })
})

it('Should_SelectExactlyTheListedTests_When_TheFamilyListsThem', function*({ expect }) {
  yield* expect(selectTests(['test/a.test.ts'], ['test/a.test.ts', 'test/b.test.ts'])).toEqual({
    _tag: 'Selected',
    tests: ['test/a.test.ts'],
  })
})

it('Should_RefuseAListedTest_When_UpstreamNoLongerHasIt', function*({ expect }) {
  yield* expect(selectTests(['test/gone.test.ts'], ['test/a.test.ts'])._tag).toEqual('Absent')
})

it('Should_MapTheRootPackageToItsOwnDirectory_When_TheFamilyIsSinglePackage', function*({ expect }) {
  yield* expect({ dir: packageDir('packages/w', '.'), upstream: upstreamDir(FAMILY, '.') }).toEqual({
    dir: 'packages/w',
    upstream: 'repos/up/packages/core',
  })
})

it('Should_MapAMemberUnderItsUpstreamPath_When_TheMemberHasAnUpstreamPath', function*({ expect }) {
  yield* expect(upstreamDir(FAMILY, 'sub')).toEqual('repos/up/packages/core/packages/sub')
})

it('Should_RefuseAVerbatimFile_When_ItsBytesDifferFromUpstream', function*({ expect }) {
  const fork = { 't.test.ts': 'aa', 'u.test.ts': 'bb' }
  const upstream = { 't.test.ts': 'aa', 'u.test.ts': 'cc' }
  yield* expect(differingBlobs(['t.test.ts', 'u.test.ts'], fork, upstream)).toEqual(['u.test.ts'])
})

it('Should_RefuseAManifestNoFamilyClaims_When_ItIsUnclaimed', function*({ expect }) {
  yield* expect(
    unclaimed(
      ['packages/a/upstream-tests.json', 'packages/b/upstream-tests.json'],
      ['packages/a/upstream-tests.json'],
    ),
  ).toEqual(['packages/b/upstream-tests.json'])
})

it('Should_ResolveEachSourceExport_When_ThePackagesExposeSource', function*({ expect }) {
  const paths = forkPaths('packages/fam/a', [
    { dir: 'packages/fam/a', specifier: 'a', exports: { '.': { '@systemfsoftware/source': './src/index.ts' } } },
    {
      dir: 'packages/fam/b',
      specifier: '@up/b',
      exports: { './x': { '@systemfsoftware/source': './src/x.ts' }, './package.json': './package.json' },
    },
  ])
  yield* expect(paths).toEqual({ '@up/b/x': ['../b/src/x.ts'], a: ['./src/index.ts'] })
})

it('Should_ImportNonSrcTypeScriptAtAnyDepth_When_HelpersSitOutsideSrc', function*({ expect }) {
  yield* expect(importedSupport(['config.ts', 'deep/dir/tool.ts', 'src/x.ts', 'test/a.test.ts', 'src/manifest.json']))
    .toEqual(['config.ts', 'deep/dir/tool.ts', 'src/manifest.json'])
})

it('Should_ImportSrcJsonOnly_When_SrcHoldsJsonAndTypeScript', function*({ expect }) {
  yield* expect(importedSupport(['src/manifest.json', 'src/index.ts'])).toEqual(['src/manifest.json'])
})

it('Should_AcceptDifferingLineEndings_When_OnlyTheEndingsDiffer', function*({ expect }) {
  const port = ['a\r', '// port:begin k\r', 'Z\r', '// port:end\r', 'c\r', 'd\r', 'e\r']
  yield* expect(judgePort(UP, port, K)._tag).toEqual('Faithful')
})

it('Should_RefuseAnInsertedLineOutsideTheRegion_When_ALineIsInserted', function*({ expect }) {
  const port = ['a', 'INSERTED', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e']
  yield* expect(judgePort(UP, port, K)).toEqual({ _tag: 'Changed', line: 2 })
})

it('Should_RefuseAnAppendedLineAfterTheLastRegion_When_ALineIsAppended', function*({ expect }) {
  const port = ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e', 'EXTRA']
  yield* expect(judgePort(UP, port, K)).toEqual({ _tag: 'Changed', line: 8 })
})

it('Should_IgnoreAPortAtItsUpstreamPath_When_ThePortKeepsItsPath', function*({ expect }) {
  const result = recordedButTracked(
    ['t.ts'],
    [{ upstream: 't.ts', port: 't.ts', blob: 'x', reason: 'r', regions: [] }],
    HashSet.fromIterable(['p/t.ts']),
    'p',
  )
  yield* expect(result).toEqual([])
})

it('Should_ReportAPortAtADifferentPath_When_ThePortLeftItsPath', function*({ expect }) {
  const result = recordedButTracked(
    ['u.ts'],
    [{ upstream: 'u.ts', port: 'x/u.ts', blob: 'x', reason: 'r', regions: [] }],
    HashSet.fromIterable(['p/u.ts']),
    'p',
  )
  yield* expect(result).toEqual(['u.ts'])
})

it('Should_IgnoreAnUntrackedUpstreamPath_When_ThePathIsUntracked', function*({ expect }) {
  yield* expect(recordedButTracked(['v.ts'], [], HashSet.empty<string>(), 'p')).toEqual([])
})
