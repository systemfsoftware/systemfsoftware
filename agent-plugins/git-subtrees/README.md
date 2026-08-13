# git-subtrees

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![CI](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/ci.yml)](https://github.com/systemfsoftware/systemfsoftware/actions/workflows/ci.yml)

A Claude Code plugin that blocks unsafe `git subtree` commands before Bash runs them.

When a command is blocked, the hook stops it and prints the reason:

```
guard-git-subtree: blocked git subtree invocation

git subtree pull with a URL is BLOCKED.
git subtree does `git fetch <url>` then `git rev-parse FETCH_HEAD` to get the commit.
...
```

## Install

```text
/plugin install git-subtrees
```

from the `systemfsoftware` marketplace, or point Claude Code at a local checkout:

```text
/plugin install /path/to/agent-plugins/git-subtrees
```

Prerequisites: Deno 2.x on `PATH`. The plugin resolves its one dependency (`just-bash`) from Deno's registry cache on first hook run — no build step, no bundled dependencies.

## What it blocks

`git subtree add|pull|push` commands that:

- **use a URL** instead of a pre-fetched ref — subtree reads `FETCH_HEAD`, a transient file, so a stale read silently squashes the wrong content,
- **omit `--prefix`** — the merge lands at the repository root and can delete files across the repo,
- **omit `-S`/`--gpg-sign`** — subtree commits bypass `commit.gpgsign` config and land unsigned,
- **omit `--squash`** — the entire upstream history is pulled into the object store,
- **are `push`** — subtrees are read-only; updates flow downstream only.

## Safe workflow

Update a vendored subtree by pre-fetching to a named ref, verifying the content, then pulling:

```bash
git fetch <url> <branch>:refs/remotes/vendor/<name>
git ls-tree refs/remotes/vendor/<name> -- package.json
git subtree pull --prefix=repos/<name> refs/remotes/vendor/<name> --squash -S -m "update"
```

## Exit contract

The hook exits `0` to allow and `2` to block, with the reason on stderr. Non-Bash tools and malformed payloads always pass (`0`).

## FAQ

**Q: The hook says "deno not found on PATH".**
A: Install Deno 2.x and restart Claude Code.

**Q: First run fails with a network error.**
A: `just-bash` is fetched to Deno's registry cache on the first hook run. Run once with network access so the cache warms up.

## Contributing

Development setup and workflow: [AGENTS.md](../../AGENTS.md).

## License

[Apache-2.0](LICENSE)
