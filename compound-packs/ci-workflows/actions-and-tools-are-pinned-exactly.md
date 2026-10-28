---
title: Every action and reusable workflow from another repository is pinned to a full commit SHA, and every tool CI fetches is pinned to an exact version
applies_when:
  - adding or bumping a uses: reference to an action or a reusable workflow
  - adding a step that installs or fetches a tool (a setup action, dlx, npx, a download)
  - setting or removing a setup action's version input
tags: [ci, pinning, supply-chain, actions, versions]
---

Every `uses:` reference to an action or reusable workflow outside this repository names a full 40-character commit SHA, with a comment beside it naming the release the SHA is. A repository that locks its workflow dependencies with GitHub's workflow dependency lockfile meets this through the lockfile. An action inside this repository (`./.github/actions/...`) needs no pin.

Every tool a job installs or fetches names an exact version: a setup action's version input is set to a full version, and a `dlx`, `npx` or download names one too.

Decision test: for each `uses:` and each tool fetch the diff adds or changes, read the reference. The diff fails on a tag (`@v6`, `@v6.1.0`), a branch, `@latest`, a version range, or a setup action whose version input is missing or a range.

Defect prevented: a moved tag or a new upstream release changes what CI runs with no change in this repository. An unrelated pull request turns red, or a compromised tag runs someone else's code with the job's token and secrets.

```yaml
# WRONG
- uses: actions/checkout@v6
- uses: actions/setup-node@v6 # no node-version: whatever the action defaults to
- run: npx some-linter@latest .
```

```yaml
# RIGHT
- uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v6.0.1
- uses: actions/setup-node@89abcdef0123456789abcdef0123456789abcdef # v6.1.0
  with:
    node-version: 24.11.0
- run: npx some-linter@3.4.1 .
```

Source: GitHub, "Secure use reference": "Pin references to actions to a commit SHA in your workflow files", because "a tag can be moved or deleted if a bad actor gains access to the repository storing the action"; a workflow dependency lockfile "supersedes SHA pinning for repositories that adopt it" (https://docs.github.com/en/actions/reference/security/secure-use).

Gate: judge
