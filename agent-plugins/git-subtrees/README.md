# git-subtrees

A Claude Code plugin that blocks unsafe `git subtree` invocations before Bash runs them.

## Install

- From a marketplace: `/plugin install git-subtrees` (marketplace: `https://github.com/systemfsoftware/systemfsoftware`).
- From a local checkout: `/plugin install /path/to/agent-plugins/git-subtrees`.

## What it blocks

`git subtree add|pull|push` invocations that:

- use a URL instead of a pre-fetched ref (`git subtree` resolves `FETCH_HEAD`, a transient file — a stale read squashes the wrong content silently),
- omit `--prefix` (operates at the repository root and can delete files across the repo),
- omit `-S`/`--gpg-sign` (subtree commits bypass `commit.gpgsign` config and land unsigned),
- omit `--squash` (pulls the entire upstream history into the object store),
- are `push` (subtrees are read-only doctrine; updates flow downstream only).

### Safe workflow

```sh
git fetch <url> <branch>:refs/remotes/vendor/<name>
git ls-tree refs/remotes/vendor/<name> -- package.json   # verify upstream content
git subtree pull --prefix=repos/<name> refs/remotes/vendor/<name> --squash -S -m "update"
```

## Prerequisites

- Deno 2.x on `PATH`. The hook errors loudly if Deno is missing.
- `just-bash@3.2.0` is resolved from Deno's registry cache on first hook run — no bundled dependencies, no build step.

## Exit contract

- `0` — allow (also for non-Bash tools and malformed payloads).
- `2` — block, with the reason on stderr.
