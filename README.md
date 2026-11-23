# constitution

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

This repository holds an organization's shared coding standards and review
policy. Every repository in the organization vendors it with `git subtree` so
that engineers and review tools check changes against the same rules.

Keeping these files in one place gives every project a common baseline for
writing code, reviewing changes, building automated checks, and guiding coding
agents.

## What is here

| File                                       | Read it when                                                                                                                                               |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | You plan, write, review, or propose a test for code in any organization repository. It holds the review criteria and leads with "Impossible states first". |
| [REVIEW.md](REVIEW.md)                     | You review a change or respond to review findings. It defines the review policy, including the finding bar, severities, and evidence.                      |
| [GRADERS.md](GRADERS.md)                   | You build or change an automated check, such as a lint rule, CI job, hook, threshold, or rubric.                                                           |
| [WORKING.md](WORKING.md)                   | Always. It describes how agents work, and every repository imports it into its always-on `AGENTS.md` or `CLAUDE.md`.                                       |
| [`docs/solutions/`](docs/solutions)        | You want to read the past problem behind a rule.                                                                                                           |

These files follow the `CODING_STANDARDS.md` and `REVIEW.md` model from the
[Compound Engineering plugin](https://github.com/EveryInc/compound-engineering-plugin).
Both `ce-code-review` and Claude Code Review read them directly as review
criteria and review policy.

## How to adopt it

1. Vendor this repository into your project at `repos/constitution/` using
   `git subtree`.
2. Add both shared files to your repository's root `REVIEW.md`, each on a line
   of its own:

   ```text
   @repos/constitution/CODING_STANDARDS.md
   @repos/constitution/REVIEW.md
   ```

3. Keep repository-specific rules in your own root `CODING_STANDARDS.md` and
   `REVIEW.md`. If your repository has no rules of its own, symlink its root
   `CODING_STANDARDS.md` to `repos/constitution/CODING_STANDARDS.md`.
4. Route agents to the shared files from your repository's `AGENTS.md`. Point
   them to `CODING_STANDARDS.md` and `REVIEW.md` under the trigger "you plan,
   write, review or propose a test", and to `GRADERS.md` under "you build or
   change a check". Do not `@`-import those files into an always-loaded file.
5. Import `repos/constitution/WORKING.md` into your always-on `AGENTS.md` or
   `CLAUDE.md` on a line of its own:

   ```text
   @repos/constitution/WORKING.md
   ```

> [!NOTE]
> If a repository has its own root `CODING_STANDARDS.md`, it still receives the
> organization's rules through the `REVIEW.md` include. Review tools locate
> standards files by placement, so the vendored copy in `repos/constitution/`
> otherwise governs only `repos/constitution/`.

## Update the vendored copy

Pull the latest rules into a repository that already vendors them:

```bash
git subtree pull --prefix repos/constitution https://github.com/systemfsoftware/constitution main --squash
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0. See [LICENSE](LICENSE).
