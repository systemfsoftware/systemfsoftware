# constitution

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)

The shared engineering laws for System F Software: how to model a domain, shape its code, prove it works and finish a change. Repositories across the organization vendor this one and read the same laws.

## What is here

| File | Read it when |
| :-- | :-- |
| [CONSTITUTION.md](CONSTITUTION.md) | You write or review code under these laws. It holds 16 laws in four sections (model the domain, shape the code, prove it, finish), each with its harm and a wrong and right example. |
| [ENFORCEMENT.md](ENFORCEMENT.md) | You build or change a check that grades work, such as a lint rule, a CI job or a rubric. It holds the gate design, each law's mechanism and its incidents. |
| [`docs/solutions/`](docs/solutions) | You want the past problem behind a rule. Each note has YAML frontmatter (`module`, `tags`, `problem_type`). |

Each law states an obligation and the harm it prevents. Read every law by its purpose: where the words and the harm disagree, the harm decides.

## Use it in a repository

Vendor this repository into the consumer with `git subtree` under `repos/constitution`, and symlink `CONSTITUTION.md` to the vendored copy, as [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware) does.

Consumers that build or change a gate route that work to `ENFORCEMENT.md`. Makers read `CONSTITUTION.md` only, so the grading rules stay out of the work they grade.

## Contributing

Setup, the validation task and the amendment rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0. See [LICENSE](LICENSE).
