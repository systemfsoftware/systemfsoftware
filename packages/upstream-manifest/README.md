# @systemfsoftware/upstream-manifest

Grade imported upstream test suites against the commit and tree they came from.

A family of packages that ports another project's tests declares itself in an
`upstream-family.json` beside its packages. Each member keeps an
`upstream-tests.json` recording which upstream tests it copied verbatim, which
it ported (with `// port:begin <case>` … `// port:end` regions), and which it
retired. The guard then holds every recorded file to upstream's bytes at
`source.ref`, regenerates each member's `tsconfig.upstream-test.json`, and keeps
`dprint.json`'s excludes equal to the files the families own.

## CLI

```
upstream-manifest            # check every declared family
upstream-manifest check      # the same
upstream-manifest --write    # regenerate the manifests, projects and excludes
upstream-manifest --selftest # run the built-in rows
```

`check` exits non-zero when a listed test is absent upstream, a verbatim file's
bytes differ, a port changed outside its marked regions, an
`upstream-tests.json` belongs to no family, or the generated projects and
formatter excludes have drifted.

## Family declaration

```json
{
  "name": "effect-workflow",
  "reason": "Effect's own WorkflowEngine suite, vendored at repos/effect",
  "source": { "ref": "HEAD", "root": "repos/effect/packages/effect" },
  "tests": ["test/workflow/WorkflowEngine.test.ts"],
  "packages": { ".": { "upstream": "." } }
}
```

- `source.ref` + `source.root` — where upstream's tree lives in this
  repository's history, read with `git ls-tree`.
- `tests` — `"all"` (every `*.test.ts(x)` upstream) or an explicit list.
- `packages.<dir>.upstream` — the member's path under `source.root`.
  `specifier` (optional) is the name upstream's tests import it by.
- `typecheck` (optional) — `{ tsconfig, blob }`, upstream's own tsconfig held to
  its blob; when present, each member's `tsconfig.upstream-test.json` is
  generated from it.

A missing `source.ref` is a named verdict: fetch it with
`git fetch --no-tags --depth=1 origin <ref>` before checking.

## API

The pure decisions are exported for reuse: `judge`, `judgePort`, `selectTests`,
`importedSupport`, `differingBlobs`, `unclaimed`, `forkPaths`, `recordedButTracked`,
`packageDir`, `upstreamDir`, `upstreamTestProject` and their verdict types. The
shell is `runCheck`, `checkFamily` and `syncTestProjects`, each an `Effect`
requiring `FileSystem | ChildProcessSpawner`.
