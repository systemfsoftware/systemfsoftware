# @systemfsoftware/upstream-manifest

Grade imported upstream test suites against the commit and tree they came from.

A family of packages that ports another project's tests declares itself in an
`upstream-family.json` beside its packages. Each member keeps an
`upstream-tests.json` recording which upstream tests it copied verbatim, which
it ported (with `// port:begin <case>` … `// port:end` regions), and which it
retired. The guard then holds every recorded file to upstream's bytes at
`source.ref`, regenerates each member's `tsconfig.upstream-test.json`, and keeps
`dprint.json`'s excludes equal to the files the families own.

Every upstream test file must carry exactly one record — a verbatim `files`
entry, a `ported` entry, a `retired` entry, or an `inPlace` entry. A file
recorded under more than one kind is refused.

## In-place suites

A suite whose files are run directly from a read-only subtree of this
repository — vendored under `repos/`, never copied into a member — is recorded
with an `inPlace` entry instead of `files`:

```json
{
  "reason": "the upstream conformance suite, run in place",
  "removal": "none",
  "files": [],
  "inPlace": [
    {
      "subtree": "repos/mcp-conformance",
      "commit": "f44482b1f8e2c3a4b5d6e7f8091a2b3c4d5e6f70",
      "files": ["test/roundtrip.test.ts"],
      "report": "packages/mcp-conformance/in-place-report.json"
    }
  ]
}
```

- `subtree` — the repository-relative path of the read-only subtree the suite
  runs from; every recorded file must be tracked at `<subtree>/<file>`.
- `commit` — the pinned upstream commit the subtree was vendored at, named in
  the verdict so a red report says which revision it graded.
- `files` — the upstream test files executed from the subtree, relative to it.
- `report` — the vitest JSON reporter output that proves they ran.

### Proving the files were executed

The guard reads `report` as vitest's JSON reporter output and requires **every**
`inPlace.files` entry to appear there with at least one assertion that actually
ran (`passed` or `failed`; a skipped or pending-only entry does not count). A
file the report does not show — including an empty report, `testResults: []` —
turns the guard red.

Produce the report by running the suite with the JSON reporter and writing it to
the recorded path:

```
vitest run --reporter=json --outputFile=packages/mcp-conformance/in-place-report.json
```

Commit the report alongside the manifest; it is the evidence the guard grades.

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
