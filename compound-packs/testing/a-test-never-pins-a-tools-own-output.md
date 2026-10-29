---
title: A test whose every assertion reads only a tool's own artifact or output, with none of our code in between, is never written
applies_when:
  - writing, ordering or reviewing a test whose assertions read a lockfile, a generated or vendored file, or the output, exit code or flags of a tool we did not write
  - deleting a test whose assertions read only such an artifact or output
tags: [testing, lockfile, generated, vendored, toolchain, platform]
---

The tool that owns an artifact checks it. The package manager checks its lockfile with a frozen install, and the compiler checks the files it generates.

A test is never written if every one of its assertions reads only one of these, for inputs the test itself supplies, with no function of ours between them:

- a lockfile's contents;
- a generated or vendored file's contents;
- a third-party tool's output, exit code or flags.

Such a test pins the tool and proves no behaviour of ours. An existing one is deleted with no replacement, under failing-tests-are-fixed-not-weakened.md.

A test that runs our own argument builder, adapter or contract against the real tool and asserts the outcome our caller sees is outside this rule; the adapters rule and our contract tests govern it. A choice we make about such an artifact, such as a version policy or a cache key, is an owned decision under the-first-question-is-whether-the-code-should-exist.md and is tested in src/ through our own function.

Where the owning tool's check does not run in CI, the finding names the missing check and goes to the owner; no lane adds a CI step for it.

Decision: for each test in the diff, the judge lists its assertions and what each one reads. The test fails if every assertion reads only an artifact or output of a tool we did not write, for inputs the test supplies, with no function of ours between them. An uncertain case escalates.

Defect it prevents: a test that pins the toolchain breaks on each upgrade of the tool and stays green when our code breaks; it repeats the tool's own check at the cost of CI and review time.

```typescript
// WRONG: the subject is the package manager's output for arguments the test passes
Then('the lockfile has no conflict markers')((s, expect) =>
  expect(readFileSync(join(s.repo, 'pnpm-lock.yaml'), 'utf8')).not.toContain('<<<<<<<')
)
```

```yaml
# RIGHT: the owning tool checks its own artifact in CI
- run: pnpm install --frozen-lockfile
```

Source: the owner, 2026-10-29: "testing a lockfile. bdd for a lockfile....". Kent C. Dodds, Write tests. Not too many. Mostly integration. (https://kentcdodds.com/blog/write-tests): "you find yourself spending time testing things that really don't need to be tested. Things that really have no logic in them at all".

Gate: judge
