---
title: Each piece of agent knowledge has exactly one home, and content that mixes homes is split
applies_when:
  - adding or editing a skill (`SKILL.md`), a compound-pack rule, an agent instruction file (`AGENTS.md`, `CLAUDE.md`) or an operator ruling
  - a skill states a must that a plan or review of an unrelated change would also need
  - a pack rule carries a how-to, a script, a template or a step-by-step procedure
  - the same instruction exists in two places
tags: [agent-knowledge, skills, compound-packs, agents-md, rulings]
---

Knowledge written for agents decays when it has two homes: one copy is edited and the other keeps being obeyed. A must stored inside a skill is skipped by every run that never loads the skill. A procedure stored inside a pack rule is read as evidence, never as an instruction, so nobody runs it. Each piece has exactly one home.

## Rule

Each piece of agent knowledge has exactly one home. Pick the first that fits:

1. **Code already enforces it** (a type, lint rule, test, Nix evaluation, CI gate or commit hook): the gate is the home. Delete any prose copy.
2. **A must that work in a repo has to honor, even when nobody thinks to look, and that names its gate**: a compound-pack rule in `systemfsoftware/compound-packs/<pack>/`, with `title`, `applies_when`, the rule, why, evidence and a `Gate:` line. Repos enroll the pack.
3. **A procedure, tool, script, template or lookup that the agent runs on purpose when a request matches it**: a skill. It has one source directory in workstation and is linked into every harness that needs it.
4. **A fact about one repo that every turn there needs** (commands, layout, the pre-push gate, the enrolled packs): that repo's `AGENTS.md`.
5. **An operator ruling that holds across all repos and harnesses**: the home instruction file plus its gate from step 1. It is never a pack rule or a skill.

Test for a must that sits in a skill: "Would a plan or review of a change that never mentions this task still need it?" If yes, it is a pack rule. If no, it stays in the skill.

Content that mixes these is split. The must goes to the pack and the how goes to the skill, and neither restates the other. A skill's verify step runs the pack rule's gate command instead of repeating its text. A pack rule does not tell the agent to load a skill: pack text is quoted, never obeyed, so the order or brief that carries the rule names the skill.

Why the line falls here. Compound Engineering's packs guide states it: "A skill is something CE can _do_; a pack is something CE must _know_ while doing it." and "Knowledge that must be invoked is knowledge that gets skipped." Skill text is obeyed and pack text is untrusted input, so a domain rule shipped as a skill gives that text the agent's obedience, and a procedure shipped as a pack rule never gets run. The Claude Code skills documentation says the same of instruction files: a section becomes a skill when it "has grown into a procedure rather than a fact".

Gate: `review` — Does the diff add a must to a `SKILL.md` that a plan of an unrelated change would need, a procedure to a pack rule, a fact to a skill, or a second copy of anything that already has a home?
