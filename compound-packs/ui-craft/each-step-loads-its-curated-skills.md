---
title: A Codex UI session sees only the skills declared in workstation codex.skills, and every skill a UI brief names resolves to a declared one
applies_when:
  - writing the order or brief for a Codex UI run
  - changing which skills Codex loads from its user skills directory
  - an agent browses a catalogue of skills to pick a design technique
tags: [ui-craft, skills, codex, curation, dilution]
---

Codex lists every skill in its skills directory in every session, so the cost of a skill is paid by all runs and the choice among near-neighbours is made by the model each time. When the directory held 177 MengTo skills, about 75 KB of descriptions were listed in each session, three skills overlapped on anti-slop, seven on scroll choreography, and about 160 were never read. The run the founder approved read six skills.

The list is therefore short and owned in code: `codex.skills` in the workstation repository is an allowlist, and its Nix evaluation throws when a declared name does not resolve to a skill source. Two things follow.

- A Codex UI session sees only the skills declared in `codex.skills`. A skill outside the list is added by a change to that list, made with a stated step, a read count or a run that needed it, never by dropping a directory into the user skills directory.
- Every skill name a UI brief or order cites is declared in `codex.skills`. A brief that names a skill the allowlist does not declare is wrong, and the name is declared or dropped before the order is sent.

An agent does not search a catalogue for a technique mid-run. A technique that is missing is a change to the list, made by the conductor with evidence of a run that needed it. Skills for 3D scenes, games, VFX, illustration styles, ready-made palettes and layouts, the MengTo workflow and publishing skills, and the evals skills stay out of the UI set: a palette skill bakes in someone else's look over the product's design system, and the evals skills belong to the judge lane.

Gate: `fact` — Does the Nix evaluation of `codex.skills` succeed, so that every declared name resolves to a skill source? `review` — Does every skill name in the UI brief appear in `codex.skills`, and does a change to the list state the step, read count or run that needed the added skill?
