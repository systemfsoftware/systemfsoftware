---
title: Each UI step loads the skills the curated list names, and Codex sees no others for UI work
applies_when:
  - writing the order or brief for a Codex UI run
  - changing which skills Codex loads from its user skills directory
  - an agent browses a catalogue of skills to pick a design technique
tags: [ui-craft, skills, codex, curation, dilution]
---

Codex lists every skill in its skills directory in every session, so the cost of a skill is paid by all runs and the choice among near-neighbours is made by the model each time. When the directory held 177 MengTo skills, about 75 KB of descriptions were listed in each session, three skills overlapped on anti-slop, seven on scroll choreography, and about 160 were never read. The run the founder approved read six skills. The list is therefore short, owned in code (`codex.skills` in the workstation repository, an allowlist that fails evaluation when a name vanishes), and each step of the pipeline names its skills in the brief.

| Step | Load by name | Job |
| ---- | ------------ | --- |
| Brief | `frontend-app-builder` (owns the flow), `ai-design-prompting`, `mengto-design-first-ui-prompting`, `saas-landing-anatomy` (section anatomy and its product-honesty rules) | spec-first prompt shape |
| Directions | `inspiration` (Magic Patterns), `mengto-generate-reference-inspired-brand-worlds`, `saas-landing-anatomy` (structure) | several directions from a reference; landing structure |
| Reference images | `upload-to-magic-patterns`, `mengto-codex-gpt-image-2-5-flare`, `mengto-unsplash-asset-images` (only without generated imagery) | images before code |
| Build | `recreate-as-raw-html`, `integrate-magic-patterns-design`, `astryx`, `stead-reference` (prior art only), `mengto-tailwindcss` | build from the design |
| Motion | `mengto-cinematic-gsap-lenis-motion-system` (the single Lenis and GSAP entry), `mengto-animation-systems`, `mengto-scroll-progress-timeline`, `mengto-optimize-web-animations` | choreography, easing, performance |
| Self-check | `playwright-cli`, `mengto-stitched-full-page-capture`, `mengto-workflow-progress-screenshots`, `mengto-workflow-score-to-target`, `mengto-iterate-until-verified`, `mengto-browser-video-recording` (on request) | capture and score loop |
| Judge | `mengto-no-ai-design-slop`, `mengto-audit-ai-design-slop`, `mengto-audit-reference-originality`, `saas-landing-anatomy` (critique against its anatomy and honesty rules) | prevention, audit, copying guard |
| Copy | `copywriting`, `saas-landing-anatomy` | literal copy in real users' words |

Three overlapping groups (the three anti-slop skills, the scroll-reveal skills, the capture skills) are meant to become one first-party skill each; until then the ones above with recorded reads stay and the rest are not linked. Skills for 3D scenes, games, VFX, illustration styles, ready-made palettes and layouts, the MengTo workflow and publishing skills, and the evals skills are not in the UI set: a palette skill bakes in someone else's look over the product's design system, and the evals skills belong to the judge lane.

An agent does not search a catalogue for a technique mid-run. A technique that is missing is a change to this list, made by the conductor with evidence of a run that needed it.

Gate: `review` — Does the brief name the skills for each step from this table? Does a change to the Codex skills directory add a skill outside this list without a stated step, a read count or a run that needed it?

`saas-landing-anatomy` is declared in the omp-infra personal profile and linked into the Codex skills directory; it is loaded by the brief, structure (directions) and critique (judge) steps and by the copy step. The #672 run did not load it, and the founder asked for it explicitly.

**Who writes copy.** Copy for Younna surfaces is written by Gemini (OpenRouter `google/gemini-3.8-flash`, called through `~/.local/state/fleet-ledger/gemini-or.ts`) from the brief's copy source file. Claude and GPT build layout and motion only; they place the copy they are given and do not author or rewrite it. A copy change is a new Gemini call, not a builder edit.
