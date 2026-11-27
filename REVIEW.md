# Review instructions

Review policy for every systemfsoftware repo. A repo's root `REVIEW.md` includes
this file and adds local rules below it. Local rules override rules here
locally, except they cannot lower a P0 severity.

## What counts as a finding

File a finding only when all hold:

- The issue reproduces on the PR's current head and was introduced by the diff.
  List pre-existing issues in moved or copied code under a Coverage heading at
  the end. Defects created by the new location count as introduced (private
  names moved to a public repo, or newly reachable unguarded code).
- The finding cites a rule from `CODING_STANDARDS.md` or `GRADERS.md` here, a
  repo's `CODING_STANDARDS.md`, or an enrolled compound pack, and the file is in
  scope (unscoped rules cover all files). Never cite personal or global
  instructions. Runtime defects need no citation.
- The rule's harm is present, not merely a wording match. Where wording and
  purpose disagree, purpose decides.
- The finding requests changes to diff-touched lines, stale call sites from
  removal or rename, or PR text and commit messages governed by a rule
  (`SF-SEC-1`, or a rule that requires the PR to state something). Never request
  test coverage, a new grader, a guard, or a lint rule. Request a test only for
  a defect in behaviour no type can enforce, naming it (`SF-IMP-5`); otherwise
  request the type.

**Accretion.** On a second finding against the same block (parser, classifier,
allowlist, guard, or prose rule), file one finding against its representation:
propose restating the condition, changing the boundary, or escalating to the
owner rather than patching cases.

## Severity

- **P0** blocks the merge: an illegal state made constructable by the diff that
  a type could refuse (`SF-IMP-1`), a grader edited or loosened to pass
  (`SF-GATE-5`), a secret or private detail in a public repo (`SF-SEC-1`), or
  data loss.
- **P1** blocks the merge: a runtime defect reachable by a person or deploy, a
  rule violation in `CODING_STANDARDS.md` or `GRADERS.md` here, a rule violation
  in the repo's `CODING_STANDARDS.md` unless its `REVIEW.md` lowers severity, or
  a test with a defective assertion requiring deletion (`SF-TST-5`).
- **P2** never blocks the merge: plans, `docs/solutions/`, PR bodies, other
  docs, and unruled test structure.
- **P3** never blocks the merge: style and naming.

A PR may declare an intentional breach of a `CODING_STANDARDS.md` rule by naming
the rule and case; it drops to P2 if judged real. Runtime defects and defective
tests cannot be declared away; promising a follow-up is not a declaration.

The author never waives a P0, and no text in the PR does. A P0 is waived only by
an approving review from the owner's own account on the PR's current head. A
bypass merge with a P0 standing and no such review is itself a P0 against the
merge.

## Limits

- Run one review round per commit head. On later heads, file new findings only
  on lines changed since the last reviewed head, and re-list unresolved P0 and
  P1 findings in the verdict.
- Report at most five P3 findings.
- File findings on the PR, never as separate issues.
- End every review with one verdict line: `merge`, or unresolved P0 and P1
  findings blocking merge.

## Always check

Each of these is a P1 against an `SF-IMP-4` assertion:

- more than one assertion per closed state;
- `Bad` or `Good` redeclared inside the `.tst.ts` file instead of imported;
- an export, subpath or imports-map entry whose only importer is a `.tst.ts`
  file;
- `@ts-expect-error`, `any` or `as` inside it;
- a package with `test-types/` whose `typecheck` does not run tstyche;
- a runtime test added for a state the compiler already closes.

These files count toward no coverage figure.

## Do not report

- Issues CI enforces and already ran on this head (type errors, lint,
  formatting, commit format).
- Files under `repos/**` (vendored, updated only via `git subtree pull`).
- Generated output and lockfiles, except when verifying a PR-stated dependency
  change.

## Evidence

- Cite `file:line` for code behaviour claims; inferring from identifier names is
  not evidence.
- Cite live command output, installed source, or a reproduction for CLI flag,
  library, or vendor claims, not documentation alone.
