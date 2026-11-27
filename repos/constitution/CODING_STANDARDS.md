# Coding Standards

Review criteria for every repository in systemfsoftware. Repositories vendor
this repo via `git subtree` at `repos/constitution/`. Local
`CODING_STANDARDS.md` files add repo-specific rules that take local precedence,
except that they cannot loosen anything `REVIEW.md` rates P0. Cite rules by ID,
such as `(SF-IMP-1)`.

Apply each rule by its purpose. Where wording and harm disagree, harm decides.

## Impossible states first

Make invalid states impossible to construct before writing or proposing a test.
A state the compiler refuses needs no test and cannot return unnoticed.

- **SF-IMP-1** In typed code, close types so illegal values cannot be
  constructed: use a union of valid combinations, a branded type per role, or a
  separate service tag per unshared resource. Model mutually exclusive states as
  a tagged union where each variant holds only its own fields. Use a plain
  nullable type only when a value is absent the same way in every state. Parse
  external data into domain types only via a decoder returning a typed result,
  never a cast or suppression comment. In untyped languages, validate external
  data at the boundary with a schema that fails on invalid input.
  - Why: an illegal value the compiler could have rejected reaches runtime,
    where downstream code trusts it.
  - Wrong: a lock helper accepted a lock spec and a nullable adapter, so a spec
    requiring a lock with no adapter ran its body unlocked.
  - Right: a single union of valid spec-and-adapter pairs made the unlocked
    state impossible to construct.
- **SF-IMP-3** In typed code, give each failure a caller handles differently its
  own tagged variant so callers can branch on it.
- **SF-IMP-4** The compiler is the evidence for such a fix. Commit one tstyche
  assertion that the refused state is refused. Put it in the package's
  `test-types/`, run by its `typecheck` script and never by its tests. Use
  `expect<Bad>().type.not.toBeAssignableTo<Good>()` (or
  `not.toBeAssignableFrom`); use `toRaiseError` only where no assignability pair
  expresses the refusal (an overload, an inference failure, a missing service),
  and always with the expected message. Import the real types: a published type
  by the package's name, an internal one by a relative path into `src/`. Never
  add or widen an export, subpath or imports map so an assertion can reach a
  type. Write one per state the change closes, and delete it with the type.
  Where the language has no such tool, paste the compiler error into the PR
  body.
  - Why: it costs no test run, fails when the state becomes constructable again,
    and passes for that reason only.
- **SF-IMP-5** Never write or propose an integration, end-to-end, or microVM
  test for an invariant a type can enforce; enforce it in types (`SF-IMP-1`).
  Test at runtime only behaviour the compiler cannot prove (decoding external
  data, peer responses, timing, or database and runtime behaviour). Run tests at
  the lightest tier reaching that boundary and name the covered behaviour in any
  test proposal.
  - Why: slow tests tie up shared hosts while proving less than a compile error.

## Tests

- **SF-TST-1** Test the published surface with real inputs and outputs, using
  only what consumers import or call, never package internals. A type assertion
  under `SF-IMP-4` is not a test and may import internal types.
  - Why: tests bypassing the published interface can pass when the shipped
    artifact is broken.
- **SF-TST-2** Derive expected values from an oracle independent of the code
  under test (requirement literal, independent fixture, law between two views,
  or second implementation).
  - Why: comparing code against its own output cannot fail when the code is
    wrong.
- **SF-TST-4** Assert outcomes, not internal steps: verify what the system
  produced, never which functions ran, which lines a file contains, or which
  keys, entries, or values repo configuration lists.
  - Why: tests coupled to steps or configuration break on refactoring and still
    pass when outcomes are wrong.
- **SF-TST-5** Every test must fail when its named behaviour breaks. Delete any
  test with a defective assertion (checking steps, configuration, or file
  layout; copying expected values from code; unable to fail; or covering removed
  behaviour); never rewrite, retitle, or replace it. Fix a test whose only fault
  is how it reaches the code (an internal import or real clock). Deleting a
  worthless test is welcome and does not count as lost coverage. When a valid
  test fails, fix the code under test, not the test.
  - Why: reshaping a bad test keeps its cost and false confidence; weakening a
    good test hides defects.
- **SF-TST-6** Keep unit tests deterministic and isolated: no child processes,
  real clocks, network calls, host ports, host file system, or shared state
  across tests. Put I/O tests in adapter suites and run them where repo testing
  rules specify.
  - Why: tests that spawn processes or sleep stall the host and fail on timing
    rather than code defects.
- **SF-TST-7** Treat a property-test timeout as a design failure. Fix its input
  schema, or delete the test if it encodes one specific scenario. Never raise
  its timeout, lower its run count, or narrow its generator.
  - Why: tuning the budget hides a schema generating out-of-domain values.

## Shape the code

- **SF-SHP-1** Keep side effects at the edges: a pure core returns the next read
  or write as data, and a thin shell executes it. The shell imports the core,
  and one composition root wires all implementations. The core never imports the
  shell, a database, or a framework.
  - Why: decision logic coupled to side effects cannot be tested or replaced in
    isolation.
- **SF-SHP-5** Fix the root cause of defects; restructure wrong underlying
  designs. Never add unrequested aliases, fallbacks, or compatibility shims.
  - Why: patching symptoms lets defects return, and each shim adds a second code
    path to maintain.
- **SF-SHP-7** Every line of code is a liability. Delete dead code, unify
  duplicate paths, or make invalid states unconstructable before adding code.
  When removing something, delete every definition, call site, and export in the
  same PR.
  - Why: unused code or competing conventions lead future PRs to imitate the
    wrong pattern.
- **SF-SHP-8** Before writing a client, script, test utility, or helper, search
  org packages and repo skills for an existing one; use or fix it in place. Name
  where you searched in any PR adding a helper. Never patch, fork, or override a
  dependency; change the design that needed it or fix it upstream.
  - Why: duplicate helpers drift out of sync, and patched dependencies silently
    diverge on upgrade.
- **SF-SHP-9** Write scripts in the repo's typed language, or in Deno or
  TypeScript if it has none. Use shell scripts only as thin wrappers setting
  options and running one command.
  - Why: shell scripts lack type checking and tests, and fail silently.

## Secrets and public repositories

- **SF-SEC-1** Never commit secrets, tokens, or credentials. Never put anything
  from a private repo into a public repo across files, fixtures, commit
  messages, PR text, or comments: private repo, package, or product names, local
  paths, hosts, people, emails, private run IDs or links, issue-tracker IDs, or
  internal agent or process names.
  - Why: leaked secrets require rotation everywhere, and private names in public
    git history cannot be erased.

## Graders and gates

Applies to graders (lint rules, CI jobs, hooks, thresholds, rubrics). Read
`GRADERS.md` when building or editing a grader.

- **SF-GATE-2** Add a grader only for a named mistake. Key it on the failure
  itself (recomputed source, compiler verdict, or real outcome), never on names,
  line positions, formatting, or author-supplied fields. Fix underlying failures
  instead of adding graders beside them.
  - Why: brittle graders pile up, block valid work, and still miss the
    underlying mistake.
- **SF-GATE-5** Edit a grader only in a PR whose task is that grader, proving it
  refuses a failing case and passes the clean tree (use a CI run when too heavy
  to run locally). Never edit, loosen, or add to a grader so in-flight work
  passes. Graders include thresholds, budgets, globs, baselines, lint configs,
  workflows, rubrics, `CODING_STANDARDS.md`, `REVIEW.md`, and test or CI
  timeouts, but not runtime timeouts waiting on a network, database, or peer.
  When the owner orders a grader changed or turned off, that is a change whose
  task is the grader: make it in its own PR, holding nothing else.
  - Why: whoever edits the grader reports the score they chose.

## Maintaining this file

- Add a rule only when a fixed review finding, fix commit, or solution record
  demonstrates the failure, no grader covers it, and it holds in every repo.
  State rules as diff-visible conditions without volatile numbers. Delete or
  merge existing rules before adding a new one.
- Rule IDs are permanent; gaps are never reused. Retired: SF-IMP-2 (merged into
  SF-IMP-1), SF-TST-3 (merged into SF-TST-5), SF-SHP-2 (merged into SF-SHP-1).
  Deleted: SF-SHP-3, SF-SHP-4, SF-SHP-6. Moved: SF-GATE-1, SF-GATE-3, SF-GATE-4,
  SF-GATE-6 to `GRADERS.md`; SF-FIN-1 to `WORKING.md`.
- Put agent workflow rules, rather than code rules, in `WORKING.md`.
