# Contributing

This repository holds two documents and the tooling that validates them. There is no production code, no build and no test suite beyond the corpus validator.

## Setup

Install [Deno](https://deno.land/), then:

```bash
git clone https://github.com/systemfsoftware/constitution.git
cd constitution
deno task prepare   # points git at the .husky hooks
```

## Verify

```bash
deno task test            # validates CONSTITUTION.md and ENFORCEMENT.md
deno task test:validator  # tests the validator itself
```

`deno task test` fails on a law without exactly one corpus entry, a duplicate handle, fewer than two incidents, a dangling citation, a missing or extra field, or a file over the word budget.

After a commit that deletes, splits, merges or re-scopes a rule, check the lineage against the revision before it:

```bash
deno task test --against <rev>
```

The pre-commit hook runs both test tasks. Commit messages use conventional format, `type(scope): subject`, and the commit-msg hook enforces it through commitlint. Do not bypass the hooks with `--no-verify`.

## Amending a law

`CONSTITUTION.md` is human-controlled: propose the change and wait for the owner. Then keep the corpus in step:

- **Same obligation, reworded or moved:** keep the id and its handle.
- **Obligations merged:** the survivor keeps the lowest surviving id, and the others move to its entry's `absorbs:`.
- **Obligation removed:** the id moves to `retired:` with its reason.
- **Obligation narrowed, widened or split:** mint a new id.

Ids are `CONST-<family><n>`, with the family letter for the section. Pick the next free number and never renumber. Handles and retired or absorbed ids are never reused. Each law needs one `ENFORCEMENT.md` entry with at least two incidents, each a real commit, path and line from this history.

Each law is one sentence addressed to the maker, with its `why` and a `wrong` and `right` example. `CONSTITUTION.md` must stay within its word budget.

## Changing the validator or the gates

Gates are judgment surfaces. A change to `scripts/validate-constitution.ts` or to the rules in `ENFORCEMENT.md` is its own commit, and it must not be shipped in the same change as the law it grades.
