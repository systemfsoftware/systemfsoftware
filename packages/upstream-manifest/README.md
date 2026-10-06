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
      "commit": "f44482ba17df816d3176962a11cdf36aec9bda00",
      "files": ["test/roundtrip.test.ts"]
    }
  ]
}
```

- `subtree` — the repository-relative path of the read-only subtree the suite
  runs from; every recorded file must be tracked at `<subtree>/<file>`.
- `commit` — the pinned upstream commit the subtree was vendored at. The guard
  reads the pin from the subtree's own metadata, never from the record: the
  `git-subtree-split:` trailer of the newest commit reachable from `HEAD` whose
  message carries `git-subtree-dir: <subtree>` — the trailer `git subtree`
  writes on the squash commit that vendors a subtree. A subtree whose metadata
  names no pin, or a `commit` that differs from the pin, turns the guard red.
- `files` — the upstream test files executed from the subtree, relative to it.

### Proving the files were executed

The report is the run in progress, never a record: it arrives through
`--report <path>`, repeated, one path per report the run wrote. The guard reads
each of them as vitest's JSON reporter output and requires **every**
`inPlace.files` entry to appear in one of them with at least one assertion that
actually ran (`passed` or `failed`; a skipped or pending-only entry does not
count). A file no report shows — including a family with `inPlace` records that
supplies no report at all — turns the guard red. A report path the repository
tracks turns it red too: a report is run output.

One upstream suite may run many scenarios from a single feature file, so a test
result's name need not be the file it exercises. Such a scenario records the
upstream file it runs in the task's metadata, as the repository-relative
`<subtree>/<file>`:

```ts
it('roundtrips a payload', ({ task }) => {
  task.meta.upstreamFile = 'repos/mcp-conformance/test/roundtrip.test.ts'
  // …
})
```

The guard reads that `meta.upstreamFile` from every assertion whose status is
`passed` or `failed`, so a report that names a file only through its assertions
shows it executed. A claim from a skipped, pending or todo assertion does not
count. A `meta.upstreamFile` naming no file of any `inPlace` record in any
declared family is refused as a stray claim, naming the report and the path.

Report paths are repository-relative. The guard chdirs to the git toplevel
before it grades, so a package-scoped task can invoke it from anywhere in the
tree.

### Wiring the run into turbo

The root `turbo.json` declares `guard:upstream` with `dependsOn: ["test"]`, and
the `test` task's `outputs` include `reports/**`, so a report is run output that
a turbo cache restore brings back with the test's other artifacts. A package
that runs an in-place suite owns both scripts:

```json
{
  "test": "vitest run --reporter=default --reporter=json --outputFile=reports/in-place.json",
  "guard:upstream": "upstream-manifest --report packages/<pkg>/reports/in-place.json"
}
```

`pnpm gate:upstream` runs every such package's guard task, and `check:local` and
`check:ci` run it after their test step, so the guard grades the reports the run
in progress wrote. A package whose family records no in-place suite omits
`--report`; a tree with no such package at all runs no guard task, and the guard
still exercises its rows through `upstream-manifest --selftest` in
`guard:projects`.

## CLI

```
upstream-manifest                    # check every declared family
upstream-manifest check              # the same
upstream-manifest --report <path>    # grade against a vitest JSON report (repeatable)
upstream-manifest --write            # regenerate the manifests, projects and excludes
upstream-manifest --selftest         # run the built-in rows
```

`check` exits non-zero when a listed test is absent upstream, a verbatim file's
bytes differ, a port changed outside its marked regions, a tracked report path is
supplied, a report is missing or shows an in-place file unexecuted, a report
claims an upstream file no in-place record declares, an in-place record's commit
differs from the subtree's pin, an `upstream-tests.json` belongs to no family, or
the generated projects and formatter excludes have drifted.

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
