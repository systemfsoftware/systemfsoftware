#!/usr/bin/env python3
"""Validate CONSTITUTION.md against constitution-rule/v1.

Gate for CONST-E1 applied reflexively: the constitution's own format must fail a
command, not a cited clause. Validates every fenced ```yaml block against
hardcoded schema fields (required_fields, optional_fields, gate_values).

Coverage is checked before schema. A rule the parser never reaches cannot be
validated, and an unterminated fence silently removes every rule after it from
the block — so counting ids in the raw text and comparing against ids parsed
out of blocks is the only way this gate can report on what it did NOT see.
Without that comparison a green run means "no rule I happened to parse was
malformed", which is not the claim the gate is making.

There is no backwards compatibility and no retirement ledger. A deleted rule
leaves its number vacant and a citation to it resolves to nothing, which is a
loud failure and needs no gate. The one identifier defect that is NOT loud is an
id that survives while its rule changes underneath it: every citation keeps
resolving, to the wrong rule. No single revision can see that, so `--against
<rev>` recomputes it from git.

Exit 0 clean, 1 with a named defect list, 3 unmeasurable — no identifiers matched
at all, reported distinctly because an id pattern that matches nothing scores a
healthy corpus and an id-free one identically.
"""
import argparse
import re
import subprocess
import sys

import yaml

PATH = "CONSTITUTION.md"

ID_RE = re.compile(r"^CONST-[A-Z]\d+$")
ID_IN_TEXT_RE = re.compile(r"^\s*- id:\s*(\S+)\s*$", re.M)
TITLE_IN_TEXT_RE = re.compile(r"^\s*- id:\s*(\S+)\s*\n\s*title:\s*(.+?)\s*$", re.M)
CITE_RE = re.compile(r"\bCONST-[A-Z]\d+\b")

# A family letter names what a rule is ABOUT, never where it sits. Adding a
# letter here is half the change; the other half is the registry in AGENTS.md.
FAMILIES = {
    "G": "Governance",
    "E": "Enforcement",
    "P": "Purity",
    "D": "Domain modelling",
    "B": "Boundary",
    "T": "Testing",
    "N": "Naming & structure",
    "W": "Work discipline",
    "S": "Subtraction",
}

HARDCODED_REQUIRED = ["id", "title", "gate", "do", "dont", "harm", "check"]
HARDCODED_OPTIONAL = ["scope", "example", "layers"]
HARDCODED_GATES = {"lint", "type-checker", "mutation", "review"}


def fail(errors):
    for e in errors:
        print(f"FAIL {e}")
    sys.exit(1)


def check_against(rev, errors, live_titles):
    """A rename and a renumber produce near-identical diffs; only a comparison
    across revisions tells them apart.
    """
    try:
        old_text = subprocess.run(
            ["git", "show", f"{rev}:{PATH}"],
            capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        errors.append(f"--against {rev}: cannot read {PATH} at that revision ({e})")
        return

    old_titles = dict(TITLE_IN_TEXT_RE.findall(old_text))
    if not old_titles:
        errors.append(f"--against {rev}: no rules found at that revision — wrong rev, or the file moved")
        return

    for rid, old_title in old_titles.items():
        if rid in live_titles and live_titles[rid] != old_title:
            errors.append(
                f"reassigned id: '{rid}' named \"{old_title}\" at {rev} and names "
                f"\"{live_titles[rid]}\" now — every citation to it resolves to a different rule"
            )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--against", metavar="REV",
                    help="git revision to check for reassigned ids")
    args = ap.parse_args()

    text = open(PATH, encoding="utf-8").read()
    errors = []

    blocks = re.findall(r"```yaml\n(.*?)```", text, re.S)
    if not blocks:
        fail(["no fenced yaml rule blocks found"])

    rules = []
    for i, block in enumerate(blocks):
        try:
            doc = yaml.safe_load(block)
        except yaml.YAMLError as e:
            errors.append(f"block {i}: YAML parse error: {e}")
            continue
        rules.extend(doc.get("rules", []))

    parsed_ids = [str(r.get("id")) for r in rules]
    declared_ids = ID_IN_TEXT_RE.findall(text)
    uncovered = [i for i in declared_ids if i not in parsed_ids]
    if uncovered:
        errors.append(
            f"{len(uncovered)} rule(s) declared in the file but never parsed "
            f"into a yaml block: {uncovered} — check for an unterminated ```yaml fence"
        )

    if not declared_ids:
        print("UNMEASURABLE: no rule identifiers matched — the corpus is empty, or the id syntax moved")
        sys.exit(3)

    seen = set()
    for r in rules:
        rid = r.get("id", "<no id>")
        for f in HARDCODED_REQUIRED:
            if f not in r:
                errors.append(f"{rid}: missing required field '{f}'")
        unknown = set(r) - set(HARDCODED_REQUIRED) - set(HARDCODED_OPTIONAL)
        if unknown:
            errors.append(f"{rid}: unknown fields {sorted(unknown)}")
        if not ID_RE.match(str(rid)):
            errors.append(f"{rid}: id does not match {ID_RE.pattern}")
        elif str(rid)[6] not in FAMILIES:
            errors.append(
                f"{rid}: family '{str(rid)[6]}' is not registered — "
                f"known families are {sorted(FAMILIES)}"
            )
        if rid in seen:
            errors.append(f"{rid}: duplicate id")
        seen.add(rid)
        if r.get("gate") not in HARDCODED_GATES:
            errors.append(f"{rid}: gate '{r.get('gate')}' not in {sorted(HARDCODED_GATES)}")
        for f in ("do", "dont"):
            v = r.get(f)
            if not (isinstance(v, str) or (isinstance(v, list) and all(isinstance(x, str) for x in v))):
                errors.append(f"{rid}: '{f}' must be a string or list of strings")
        ex = r.get("example")
        if ex is not None and not (isinstance(ex, dict) and all(isinstance(v, str) for v in ex.values())):
            errors.append(f"{rid}: 'example' must be a map of strings")

    for cited in sorted(set(CITE_RE.findall(text))):
        if cited not in seen:
            errors.append(f"dangling citation: '{cited}' is cited in {PATH} but names no rule")

    if args.against:
        check_against(args.against, errors, dict(TITLE_IN_TEXT_RE.findall(text)))

    if errors:
        fail(errors)
    suffix = f"; no id reassigned since {args.against}" if args.against else ""
    print(f"valid: {len(rules)} rules across {len(blocks)} yaml blocks, {len(FAMILIES)} families{suffix}")


if __name__ == "__main__":
    main()
