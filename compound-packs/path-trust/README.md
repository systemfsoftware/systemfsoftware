# Path Trust Compound Pack

Judgment for directory allow-lists that a checker canonicalizes before it compares. Such a checker authorizes whatever directory a root resolves to, so the declared root has to stay bound to the intended directory in every evaluation that renders it and every environment it runs in, given who can rewrite the root or its ancestors.

The pack applies when a change:

- declares or changes a directory authorization root (spawn cwd roots, session roots, workspace roots, mount roots) that a checker canonicalizes;
- changes a parameter whose value feeds such a root;
- adds an evaluation, host or platform that renders a checker with such a root;
- changes whether a checker resolves symlinks in its roots.

Each rule's `applies_when` names the situations it governs, and review matches them to the change by meaning. A path list is never the only test of applicability. The tags `path-trust`, `allow-list`, `realpath` and `symlink` let resolution by tag find the pack.

Each rule's id is `path-trust/<file slug>`. A slug is never renamed; a retired rule is deleted outright and its id is never reused.

Rules in this pack govern:

- Directory allow-roots that a checker canonicalizes: aliases that move authorization, missing or unmounted roots, literal `~`, and the per-evaluation value (`allow-roots-stay-bound-to-their-directory`).

No tool enforces these judgments; each rule's gate is review.
