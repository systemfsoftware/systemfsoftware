# A Rename Branch Meets an Upstream Refactor: Port Under the Conforming Name

## Context

A branch that mass-renames files (here: kebab decision stems locked to exports, PR workflow-file-naming) collides with main when main independently refactors the same files (#346 branded decision channels, #351 the meta-core split into mutation-sized private leaves). `git rebase` replays every cutover commit against shifted ground and produces ~35 conflicts per commit; `git merge` collapses them to one round but marks each collision `UU`/`DU`/`UD` with both sides half-right: the branch owns the naming, main owns the newer content.

## Guidance

Resolve by authority, not by side. Two questions per conflicted path: who owns the file's _name_, and who owns its _content_.

1. **Main restructured the region (evicted, split, or moved the file)** -> main's structure wins. Take main's content wholesale (`git checkout --theirs`), delete the branch's renamed counterpart, and patch the import specifiers main's own files use. The branch's rename dies with the file it renamed; griefing the rename back would fight main's architecture.
2. **The branch renamed a file main only modified** -> keep the branch's path and export name, port main's content into it (`git show origin/main:<old-path>` with an export-name sed into the new file), delete main's old-path file, and patch importers. The rename survives; the content stays current.
3. **Both changed fixtures/tests of the same decision** -> port main's semantic contract (e.g. refusal-as-Decision after branded channels) into the branch's named fixture, then hand-merge the test file so scenarios reference the branch's names.
4. **After staging every resolution, let the branch's own gates enumerate residue.** Enrolled-at-error rules, typecheck, and suites flag every path the mechanical pass missed - a stale import is a red task, not a silent drift. `pnpm check:local` red-green cycles cheaper than re-deriving the collision set by hand.

Choose a merge commit over per-commit rebase when the collision count is in the dozens: one resolution round replaces N, and the pre-push hooks that demand ancestry with main accept a merge.

## Applicability

Applies when a branch's value is naming/movement and main's value is content evolution. Inverted cases - the branch owns content, main owns movement - resolve by the same authority question with the sides swapped. Does not apply when either side is unreconcilable with the other's architecture: that is a rebase-of-intent, not a merge.
