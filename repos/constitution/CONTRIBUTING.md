# Contributing

## Setup

Install [Deno](https://deno.land) 2, then run `deno task prepare` once to enable
the commit hooks.

## Verify

```bash
deno task check
```

It checks the formatting of every markdown file. CI runs the same task as the
required `check`.

## Changing a rule

- A rule is one bullet: a bold ID, one or two sentences addressed to the reader,
  and a `Why:` line naming the harm it prevents. Add a wrong and a right example
  only where the law is hard to apply without one.
- An ID is `SF-<family>-<n>`. Take the next free number in the family. Never
  renumber a rule or reuse a removed ID; add a removed ID to the former-ID table
  with where its obligation went.
- A rule belongs here only if it holds for every repository in the organization.
  A rule for one repository goes in that repository's `CODING_STANDARDS.md`; a
  rule about how an agent works goes in that agent's own instructions.
- Delete or merge before you add. A new rule names the failure it prevents.
- Commits follow Conventional Commits; the commit hook runs commitlint.
