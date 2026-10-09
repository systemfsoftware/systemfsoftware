# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Constitution corpus

### Constitution corpus
The complete set of law documents the repository ships, treated as one unit. The corpus is what the gate certifies and what agents are bound by — not any single file's contents. Shrinking the measured portion of the corpus is a defect, not an optimization.

### Rule
One law in `CONSTITUTION.md`, carrying an id of the form `CONST-<family><number>` — the family letter is one of G, E, P, D, B, T, N, W, S (governance, enforcement, purity, domain modelling, boundary, testing, naming & structure, work discipline, subtraction) — a one-sentence `law`, its harm in `why`, and a wrong/right `example`, with exactly one entry in the `ENFORCEMENT.md` corpus holding its frozen handle, checks, mechanism, severity, waiver and failure incidents. A rule is the atomic unit of law. A law whose obligation survives keeps its id even when merged: it takes the lowest surviving id, and the others go to its entry's `absorbs:`. A removed obligation goes to `retired:` with its reason, and a changed obligation takes a new id. Minting takes the next free number in the family — a minting law enforced by review, not by the gate. An absorbed or retired number is never reused for new law.


### Vacuous pass
A gate exiting green because it measured less than it claims — a missing input, an input that contributes nothing, a comparison arm that reads only part of the history. The output shape is identical to a healthy run, so the green actively certifies the absence of defects it did not look for. The doctrine this repo's gate is built on: assert the corpus, not only the contents; a gate that cannot fail is a certificate, not enforcement.

### Residency
The delivery contract for the maker's law: whatever must bind the agent's choices is always present in its context window, with no retrieval step. The counter-design — a thin resident pointer plus retrieved full text — forces presence at fetch time but never conformance at use time. Residency delivers obligation, not enforcement: the window tells the maker what is required, and whether the requirement held is decided afterward by instruments the maker cannot edit. What cannot fit residency is reference material and instrument doctrine, not law.

### Corpus gate
The single check that certifies the constitution corpus — schema of every law and corpus entry, the word budget, id and family registry, handle uniqueness, citation integrity across both files, and, on demand, lineage against an earlier revision: every id there is live, absorbed, a judging rule, or retired. It runs as the repository's test command and again at every commit through the pre-commit hook, which makes any corpus-shape change also a gate change: the gate certifies the very input set a restructure edits.
