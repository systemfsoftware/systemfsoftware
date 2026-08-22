# An Escape Hatch Is An Unfalsified Hypothesis

Decision: a prohibition ships no allowlist, no per-package disable and no filename exemption until
the "these sites cannot comply" claim behind it has been falsified by a compiling probe. Run the
probe first. Grant nothing a probe defeats.

## The argument

1. A prohibition with an escape hatch is satisfiable by writing a declaration — an `allow` entry, a
   dated baseline, a config `off`. The author who trips the rule is the author who mints the
   exemption.
2. That inverts the rule's polarity. "Do not hand-declare `_tag`" becomes "declare a reason", and a
   positive directive passes while the forbidden thing stands. Same defect as a gate cleared by
   writing the token it scans for (`CHK1`), and the wiki's `rule-polarity` `A6` names it from the
   other side: a gate satisfiable by writing a declaration is unverifiable by construction.
3. Every hatch is justified by a **population claim** — "these N sites cannot comply." The claim is
   load-bearing, empirical, and almost never tested, because the hatch is cheaper to write than the
   migration it excuses.
4. The claim is also cheap to test. It asserts that no compliant form exists for a cohort, and
   "a compliant form exists" is decided by a compiler, not by argument.
5. So the hatch is a hypothesis wearing a config key. Test it before granting it.

## The probe

One scratch file per prohibition, holding the proposed compliant form for **one representative of
each cohort the hatch would cover**. Run the owning package's own `typecheck`. Read the exit code,
then delete the file.

Measured on 2026-08-22 for a rule banning hand-written `_tag` members in type positions, against
five cohorts each independently claimed unmigratable:

| Cohort claimed unmigratable                               | Compliant form the probe compiled                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Recursive schema anchors                                  | tag from a non-recursive `TaggedStruct` base + recursive fields hand-written beside it               |
| Runtime ADT with a shared prototype                       | `const XTag = {_tag:'X'} as const` -> `type XTag = typeof XTag` -> `interface X extends Proto, XTag` |
| Fields no schema encodes (`Effect`, `Stream`, `Duration`) | same carrier; the unencodable members stay hand-written                                              |
| A field that must stay wider than its schema              | `Omit<S.Schema.Type<typeof Base>, 'f'> & { f: Real }`                                                |
| A type-test fixture that may hold no runtime values       | carriers in a sibling module, reached by `import type` (emits nothing)                               |

Five of five compiled. The hatch was unnecessary and would have shipped unexamined.

## Why the claims were wrong, generalizably

**The forbidden token never participated in what made those types hard.** Recursion, prototype
methods, and unencodable fields all lived in _other_ members. So the tag was always derivable or
inheritable, and the genuinely hard members stayed hand-written next to it.

Expect this shape. A cohort is usually called unmigratable because _the type_ is hard, when the
rule constrains one member of it. Ask which member the rule touches and whether that member is
implicated in the difficulty. Often it is not, and the exemption was scoped to the wrong noun.

## Probe hygiene

Three ways a probe lies, all met in one session:

- **The scratch file must satisfy the repo's other rules**, or the probe reports their violations
  instead of your answer. A module-scope schema in a plain `.ts` fired `schema-declaration-location`
  and said nothing about the question asked; renaming it `*.schema.ts` restored the signal.
- **A `@ts-expect-error` must be consumed.** An unused one is reported as unused, so a probe whose
  negative control never fired proves the opposite of what it claims. Check that the directive was
  used, not merely that the file compiled.
- **A stale build output makes the probe lie in both directions.** A type test resolving a package
  through its exports map reads the built `.d.ts`, not the source: an unbuilt fix reads as red when
  it is green, and a removed export reads as green when it is broken. Build before believing either.

## What this does not license

The conclusion is about _ungrounded_ exemptions, not all of them. A hatch whose population claim has
been falsified is cheating; a hatch whose claim survives a probe is a documented boundary, and the
honest form of it is a test that pins the boundary rather than a config key that hides it. When a
prohibition genuinely cannot reach a shape — a grammatical rule cannot resolve `{ [T]: 'X' }` where
`T` is a const, and a type-blind rule cannot resolve a mapped type — say so in a `valid` test case
and narrow the rule's advertised claim to match. A rule whose message outruns its predicate fails
from the other side (`REPO-A4`).

Related: `label-routed-rules-are-unfalsifiable.md` (a rule keyed on an author's assertion never runs
on the violation it targets — the same circularity, entered through routing instead of exemption),
`a-prohibition-must-close-transitively.md`, and `../tooling-decisions/rule-admission-severity-and-accretion.md`
(which prices `error` + dated baseline as the migration posture; this note is the constraint on when
a baseline entry is honest).
