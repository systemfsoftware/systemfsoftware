---
title: A directory allow-root that a checker canonicalizes stays bound to the intended directory in every evaluation and every running environment
applies_when:
  - declaring a directory authorization root (spawn cwd roots, session roots, workspace roots, mount roots) that a checker canonicalizes before comparing
  - choosing or changing the value of a parameter that feeds such a root
  - adding an evaluation, host or platform that renders a checker with such a root
  - changing a checker so it starts or stops resolving symlinks in its roots
tags: [path-trust, allow-list, realpath, symlink]
---

A checker that canonicalizes both the requested path and its roots compares resolved paths. What it authorizes is whatever directory each root resolves to, not the spelling the configuration declares. A root therefore has to stay bound to the intended directory, given who can rewrite the root or any of its ancestors. A canonical spelling helps, because no link in it can be swapped, but it is not enough on its own: if a user-writable process can replace one of its ancestors with a link, the binding moves anyway. An alias is not wrong on its own either: a link that only an administrator can change, such as a system mount alias owned by root, keeps the binding as well as the target's path does.

Three failure modes:

- **An alias moves authorization.** Take `/home/alice/Projects -> /srv/code`. The checker resolves the link when it checks, so it admits whatever the link points at at that moment. Any process that can rewrite the link, which for a link in a home directory is any process running as that user, moves the allow-list to another tree without touching the configuration. It does not only widen it: the intended tree can drop out while an unintended one is admitted, and a review of the configuration sees neither.
- **The root is missing or unmounted.** The path exists where one evaluation runs and not where another does. Under a checker that refuses on a resolution error, nothing lies under the root and every request is refused. That fails closed only under the checker's actual error handling (a checker that falls back to the unresolved spelling, or skips the root, behaves differently) and only while nothing can create the path. If a user can create the missing directory or a link at that path, the root starts admitting whatever they put there.
- **A literal `~` is not a home directory.** `realpath` never expands `~`; the shell does. A root written as `"~/Projects"` and handed to a checker without tilde expansion names a relative directory called `~` under the process's working directory. It is a separate bug from the alias case, and the fix is to expand the home directory where the value is built, not in the checker.

An evaluation produces a configuration; a running environment has mounts. The same machine can be rendered by two evaluations (a NixOS system and a home-manager generation, or a container image and a host install) whose running environments mount different things, so one literal shared by both can be a real directory in one and an alias or a missing path in the other. A configuration that evaluates cleanly says nothing about the mounts it will run under.

An alias paired with a resolving checker reads as careful on both sides, so it survives review. A missing root that fails closed raises no alarm: its only symptom is refused requests on the environment nobody exercised.

## Rule

- Declare each root so it resolves to the intended directory in every running environment that renders it, and so that nothing able to rewrite the root or any of its ancestors sits below the trust level the allow-list protects. Prefer the canonical path; accept an alias only when every link in its chain is owned and writable by an administrator alone.
- **The value is per evaluation, not per machine.** Take it from a parameter, and give that parameter the intended directory in each evaluation that renders the checker. Decide each value from what that evaluation's running environment mounts and persists, not from another evaluation of the same machine.
- Expand home directories where the value is built. Never hand a checker a literal `~`.
- Keep canonicalizing the requested path. This rule is about the root side only: resolving the requested path is what stops `..` and link escapes.
- The rule holds when the checker resolves its roots once at startup rather than on every check. The authorized set is then fixed when the process starts and moves on the next restart.

```nix
# WRONG: an alias in a user-writable home. The checker resolves it, so the
# authorized tree is wherever the link points now.
allowedRoots = [ "/home/alice/Projects" ];   # -> /srv/code

# WRONG: a literal tilde. realpath does not expand it.
allowedRoots = [ "~/Projects" ];

# WRONG: one literal for two evaluations. /data/work is mounted where the
# home-manager generation runs and absent under the NixOS system.
codingRoot = "/data/work";

# RIGHT: each evaluation's real directory, from a parameter each evaluation sets.
codingRoot =
  if isNixOS then
    "/home/alice/work"   # persisted directory on the NixOS system
  else
    "/data/work";        # the mount on the other host
```

Gate: `review`. For each declared root, the reviewer names:

- the checker that consumes it, whether that checker canonicalizes roots, and what it does when a root fails to resolve;
- every evaluation that renders it. Enumerate the outputs with `nix flake show`, and add any entrypoint outside the flake's outputs, such as a separate evaluation file for a non-NixOS host;
- the value it takes in each of those evaluations, read with `nix eval` of the consuming option on each output, never from the source module that sets the parameter. Without Nix, read the rendered configuration file each environment actually loads;
- whether that value is bound to the intended directory where it runs. On NixOS, compare it against the same evaluation's `fileSystems` and persistence declarations. On any other host, run `realpath` on the root there and check the owner and write permission of the root and each of its ancestors.
