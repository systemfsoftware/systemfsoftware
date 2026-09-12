---
title: Bundling a CLI whose dependencies are not all code
date: 2026-09-12
category: tooling-decisions
module: stryker-js-cli
problem_type: tooling_decision
component: build
symptoms:
  - "`Error: Cannot find native binding` — the CLI dies before the first run event"
  - "`Cannot find package '@systemfsoftware/stryker-js-html-reporter' imported from dist/main.mjs`"
  - '`Reporter "html" failed while draining the terminal report`, exit code 3, after a verdict printed'
root_cause: config_error
resolution_type: config_fix
severity: high
tags: [bundling, tsdown, rolldown, wasi, native-binding, cli, self-contained]
---

# Bundling a CLI whose dependencies are not all code

## Problem

The `stryker` command is published as a bin-only package: no importable entry point, and no runtime dependencies — everything it uses inlined into the shipped executable. Inlining the module graph is the easy half. The emitted chunks then import nothing but `node:` builtins, the build's `onlyImport` guard is satisfied, and the artifact still dies at run time, because three of the things it depends on are not modules. They are a platform-native parser binding, a plugin module the engine loads by URL, and a client bundle a reporter reads from disk.

Each of the three resolves against the directory of the emitted chunk. In a published tarball that directory is the package root with no `node_modules` above it, so each fails only in an install — never in the repository, where the workspace's own `node_modules` sits one level up and quietly answers all three.

## Symptoms

- `Error: Cannot find native binding`: the process exits before the first run event. The parser's loader reaches its platform package through a computed `require`, which survives bundling verbatim.
- `Cannot find package '@systemfsoftware/stryker-js-html-reporter' imported from main.mjs`: a runtime `import.meta.resolve` of a package the bundle had already inlined, evaluated against the chunk's location.
- `Reporter "html" failed while draining the terminal report`: a run completes, prints its verdict, writes its JSON report, and exits 3 — the HTML reporter could not read its client bundle off disk.
- All three pass the build's own `onlyImport` guard. That guard reads the static import graph, and none of the three appears in it: the failing specifiers are arguments to `createRequire`, `import.meta.resolve`, and a host-supplied plugin descriptor.

## What Didn't Work

**Externalizing the native binding.** A `neverBundle` list for the parser and its binding builds clean and runs, in the repository. It also reintroduces exactly what the bundle exists to remove: every consumer installs the parser plus whichever per-platform binary its machine matches. Rejected — the point of the exercise is that installing this package installs nothing else.

**Copying the platform `.node` beside the chunks.** The loader tries a relative `./parser.<platform>.node` before the package lookup, so a copied binding resolves. But the copy is the build machine's platform: the published tarball would carry one platform's binary and silently serve it to all of them. Rejected as a correctness defect, not a size one.

**Serving the native binding as an optional dependency of the CLI.** Symptom, not cause: it makes the binding resolvable by declaring a dependency the artifact never statically imports, and leaves an install whose runtime needs are a lie.

**Relying on the package's contract lane.** That lane installed every workspace package into its sandbox by name before the CLI ran, so the CLI's own declared dependencies were never consulted, and a packed executable shipping no WebAssembly module at all still passed: the binding package beside it answered `require.resolve` for the module the loader wanted. The failure the lane existed to catch was structurally invisible to it. It now installs the packed executable alone and offline, so the resolution it exercises is the artifact's own; see Verification.

## Mechanism

1. **A bundler inlines by resolving static specifiers.** A computed `require` or a computed `import.meta.resolve` is a string with no module behind it, so nothing is inlined and nothing is externalized: the string ships. Its target is resolved by the host's loader against the chunk's directory, and a `node_modules` walk upward from the package root of an installed tarball finds nothing.
2. **A plugin boundary is loaded by URL at run time.** The engine takes a reporter plugin as a module descriptor and imports it through the host loader. Code behind that boundary cannot be inlined into the host at all — it has to exist as a file.
3. **The `onlyImport` guard is a claim about the static graph, not about the artifact.** It is necessary and not sufficient. It certifies that every statically-known import is a `node:` builtin; it says nothing about a specifier assembled at run time.
4. **The repository is the one environment where this cannot be seen.** The workspace's `node_modules` is one directory above the package, so all three resolvers succeed locally. The defect is created by the build and observable only outside the tree that builds it.

$$\text{runnable}_\text{installed} = \text{static graph inlined} \;\wedge\; \text{every runtime specifier resolvable}$$

The second conjunct is what a bundle-only build omits.

## Architectural Invariants

**A bundle's self-containment is decided by what it resolves at run time, not by what it imports statically.** Audit for computed specifiers — `createRequire(...)(const)`, `import.meta.resolve(...)` read from disk, and any specifier a host passes in — before claiming an artifact stands alone. A guard over the static graph is a proof of a weaker statement.

**A value a runtime resolves from a package becomes a build-time constant when that package is inlined.** The HTML reporter's client bundle is 224 kB of static asset it used to locate by specifier and read at report time. Inlining the reporter retires the package, and with it the only thing that could answer that specifier — so the build substitutes the text into the bundle. The reporter keeps the disk path as its fallback, which is what a reader of the _unbundled_ package still needs, and the substitution is keyed on a constant a bundler may define rather than on a mode the package can detect.

**A native artifact with a portable equivalent is a bundling problem; one without is a dependency.** The parser is Rust compiled either to a per-platform `.node` or to WebAssembly. Only the second is one artifact for every platform, so aliasing the parser to its WASI entry is what makes a dependency-free tarball possible at all. Where no portable equivalent exists, the honest outcome is a declared dependency, not a cleverer build.

**A plugin boundary survives bundling as a file, not as inlined code.** The engine imports the HTML reporter through the host loader, so the reporter ships as its own emitted entry and the host hands over a URL relative to itself. Which entry belongs to which boundary is a fact about the loader, and the build has to reproduce it.

**The version of a substituted native artifact must be pinned to the code that binds it.** The parser's JavaScript and its WebAssembly module exchange a private ABI. The build compares the parser's version to the binding's and throws when they differ, so a dependency bump cannot produce a bundle whose two halves disagree.

**Self-containment is proven where nothing is installed.** The claim is about an environment, so the test must be one.

**A synchronous call into an in-process WebAssembly VM is not blocking I/O.** The binding also offers an async parse on a worker pool, which costs more than it returns here: the pool's worker resolves its runtime through a locally shadowed `require`, so it cannot be inlined and dies in a tarball, and every pool worker constructs WASI, so one run on a one-file fixture printed 33 experimental warnings and took 251 ms against 1 warning and 140 ms for the synchronous call. Parsing stays synchronous behind an import deferred to first use, which is what leaves a command that never parses silent.

## Verification and Prevention

The gate is an artifact run in an environment with no packages in it — the same shape the repository's e2e lane uses for a nix-built CLI, where the store closure _is_ the proof. Three checks, all cheap:

```bash
# Runs the whole engine, parser and reporter from a directory holding only dist/
node <package>/dist/main.mjs merge-reports --parts <parts> --out <out>
test -f <out>/mutation-report.html

# Nothing is fetched and nothing else is installed
npm install --offline <packed tarball>    # reports "added 1 package"

# The substituted asset appears exactly once, in the chunk that needs it
node -e "const s=require('fs').readFileSync('dist/reporters/html.mjs','utf8'); \
  if(!s.includes('MutationTestElements')) process.exit(1)"
```

A report-producing command is the right gate because it exercises the bundled parser, the engine's plugin load, and the reporter's asset read in one pass, and it needs no mutation run.

Code smells to grep for on any bundled entry point:

- a specifier passed to `createRequire` or `import.meta.resolve` whose target is also a declared dependency
- a package that reads a file from a dependency at run time (an asset, a template, a client bundle)
- a `bin`-only package whose manifest still declares `dependencies`
- a build whose guard certifies imports while the artifact resolves specifiers
- a contract lane that installs the workspace's own packages before testing the published artifact

**Recorded cost.** The WASI parser runs on Node's experimental WASI implementation, so the first parse prints `ExperimentalWarning: WASI` on standard error. The parser is imported on first use rather than at module evaluation, so a command that never parses writes nothing to either descriptor; a run prints it once, where the CLI already writes its own log lines. Standard output, the exit code, and the run-event stream are unaffected, and no supported API lets the entry suppress a single warning; re-execing Node with a flag is the only alternative and costs a process spawn. The alternative — a platform-native binding — costs every consumer a dependency. The warning is the cheaper of the two, and is named in the release note rather than hidden.

## Related

- `docs/solutions/tooling-decisions/tsdown-manages-publishconfig-during-build.md` — how the `exports` and `bin` fields this change renders empty are generated.
- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — the other direction of the same question: what an install resolves against.
- `@systemfsoftware/stryker-js-cli` rules CLI-D1 through CLI-D4 — the invariants above, each with its runnable gate.
- `Installing the mutation tester` — the CLI contract lane's feature that gates this claim: the packed executable installed alone and offline, the closure it installs, and a run rendering both reports from it.
