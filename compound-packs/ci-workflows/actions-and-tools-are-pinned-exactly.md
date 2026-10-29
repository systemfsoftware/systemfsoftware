---
title: Pin external actions and workflows to full commit SHAs, and CI tools to exact versions
applies_when:
  - adding or bumping a uses: reference to an action or a reusable workflow
  - adding a step that installs or fetches a tool (a setup action, dlx, npx, a download)
  - setting or removing a setup action's version input
tags: [ci, pinning, supply-chain, actions, versions]
---

Pin every `uses:` reference to an external action or reusable workflow to a full 40-character commit SHA, with a comment naming the release. Local actions (`./.github/actions/...`) need no pin. Repositories using GitHub's workflow dependency lockfile meet this through the lockfile.

Pin every tool installed or fetched in CI (`setup-*` actions, `dlx`, `npx`, downloads) to an exact version.

Decision test: For each `uses:` reference and tool fetch added or modified in the diff, reject:

- A tag (`@v6`, `@v6.1.0`), branch, or `@latest`.
- A commit SHA missing a release comment.
- A setup action missing a version input or using a version range.
- A `dlx`, `npx`, or download command using `@latest` or a version range.

Defect prevented: A moved tag or new upstream release changes what CI runs with no change in this repository. An unrelated pull request turns red, or a compromised tag runs someone else's code with the job's token and secrets.

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
